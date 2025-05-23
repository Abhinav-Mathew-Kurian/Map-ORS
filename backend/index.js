require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose')
const cors = require('cors')
const { startSimulation } = require('./publisher')
const Station = require('./Station')
const User = require('./User')
const Route =require('./Route')
const axios =require('axios')
const socketIo = require('socket.io');

const port = process.env.PORT;
const mongoDb = process.env.MONGO_URL

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors())

const connectDb = async () => {
    try {
        await mongoose.connect(mongoDb)
        console.log("connection successful with Mongo db! Ready to serve")
    }
    catch (err) {
        console.error("Connection error with mongoDB", err)
    }
}
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const activeNavigations = new Map();

// Helper function to interpolate between two coordinates
function interpolateCoordinates(start, end, progress) {
  const lat = start[1] + (end[1] - start[1]) * progress;
  const lng = start[0] + (end[0] - start[0]) * progress;
  return [lng, lat];
}

function processRouteForMovement(routeData) {
  const movementPoints = [];
  const routeCoordinates = routeData.features[0].geometry.coordinates;
  const steps = routeData.features[0].properties.segments[0].steps;
  
  // Calculate total points needed based on route duration (1 point per second)
  const totalDurationSeconds = Math.ceil(routeData.features[0].properties.summary.duration);
  const totalPoints = Math.max(totalDurationSeconds, routeCoordinates.length);
  
  // Simple approach: distribute points evenly across route coordinates
  for (let i = 0; i < totalPoints; i++) {
    const progress = i / (totalPoints - 1);
    const coordIndex = Math.floor(progress * (routeCoordinates.length - 1));
    const nextCoordIndex = Math.min(coordIndex + 1, routeCoordinates.length - 1);
    
    if (coordIndex === nextCoordIndex) {
      movementPoints.push(routeCoordinates[coordIndex]);
    } else {
      const localProgress = (progress * (routeCoordinates.length - 1)) - coordIndex;
      const interpolatedPoint = interpolateCoordinates(
        routeCoordinates[coordIndex], 
        routeCoordinates[nextCoordIndex], 
        localProgress
      );
      movementPoints.push(interpolatedPoint);
    }
  }
  
  return movementPoints;
}
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  socket.on('join-user', (userId) => {
    socket.join(userId);
    socket.userId = userId;
    console.log(`User ${userId} joined room`);
  });
  
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    // Stop navigation if user disconnects
    if (socket.userId && activeNavigations.has(socket.userId)) {
      const navigation = activeNavigations.get(socket.userId);
      clearInterval(navigation.interval);
      activeNavigations.delete(socket.userId);
    }
  });
});



// Route----------------------------------------->

app.get('/', (req, res) => {
    res.send("Hello Map APp Backend!");
})

app.get('/station', async (req, res) => {
    try {
        const { lng, lat, maxDistance, limit } = req.query;
        if (!lng || !lat) {
            return res.status(404).json({ error: 'lattitude and longitude not provided' })
        }
        const stations = await Station.find({
            location: {
                $near: {
                    $geometry: {
                        type: "Point",
                        coordinates: [parseFloat(lng), parseFloat(lat)],
                    },
                    $maxDistance: parseFloat(maxDistance) * 1000,
                }
            }
        }).limit(parseInt(limit));
        res.json(stations)
        console.log("Stations requested")
    }
    catch (err) {
        console.log("Error fetching Station", err)
    }
})

app.get('/getRoute', async (req, res) => {
  try {
    const { startLat, startLng, endLat, endLng, userId } = req.query;
    const API = process.env.ORS_API;

    if (!API) {
      console.error('ORS_API environment variable is not set.');
      return res.status(500).json({ error: "Server configuration error: API key missing." });
    }
    if (!startLat || !startLng || !endLat || !endLng) {
      return res.status(400).json({ error: 'Missing start or end coordinates.' });
    }
    if (!userId) { 
      return res.status(400).json({ error: 'userId is required to save the route.' });
    }

    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${API}&start=${startLng},${startLat}&end=${endLng},${endLat}`;
    
    const response = await axios.get(url);
    const data = response.data; 
    
    // Save route to database
    const newRoute = new Route({
      userId: userId, 
      type: data.type, 
      bbox: data.bbox,
      features: data.features,
      metadata: data.metadata
    });

    await newRoute.save();
    console.log("Route saved to MongoDB with ID:", newRoute._id);
    
    // Process route for movement using existing route data
    const movementPoints = processRouteForMovement(data);
    
    // Send route data with processed movement points
    const responseData = {
      ...data,
      routeId: newRoute._id,
      movementPoints: movementPoints,
      totalDistance: data.features[0].properties.summary.distance,
      estimatedDuration: data.features[0].properties.summary.duration
    };
    
    res.json(responseData);

  } catch (err) {
    console.error('Error getting and saving route:', err.message || err);
    res.status(500).json({ error: 'Failed to get route' });
  }
});

// Start navigation endpoint
app.post('/startNavigation', async (req, res) => {
  try {
    const { userId, routeId } = req.body;
    
    if (activeNavigations.has(userId)) {
      return res.status(400).json({ error: 'Navigation already active for this user' });
    }

    // Get route from database
    const route = await Route.findById(routeId);
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }

    const movementPoints = processRouteForMovement(route);
    
    const navigation = {
      userId,
      routeId,
      movementPoints,
      currentIndex: 0,
      status: 'active', // active, paused, stopped
      startTime: new Date(),
      interval: null
    };

    // Start movement interval (1 second updates)
    navigation.interval = setInterval(async () => {
      if (navigation.status !== 'active') return;
      
      if (navigation.currentIndex >= navigation.movementPoints.length) {
        // Navigation completed
        clearInterval(navigation.interval);
        activeNavigations.delete(userId);
        
        io.to(userId).emit('navigation-completed', {
          message: 'Navigation completed successfully!'
        });
        
        console.log(`Navigation completed for user ${userId}`);
        return;
      }

      const currentPosition = navigation.movementPoints[navigation.currentIndex];
      
      // Update user location in database
      try {
        await User.findOneAndUpdate(
          { userId: userId },
          {
            $set: {
              'location.coordinates': currentPosition
            }
          }
        );

        // Send real-time update to frontend
        const progress = (navigation.currentIndex / navigation.movementPoints.length) * 100;
        const remainingPoints = navigation.movementPoints.length - navigation.currentIndex;
        
        io.to(userId).emit('location-update', {
          position: currentPosition,
          progress: progress,
          currentIndex: navigation.currentIndex,
          totalPoints: navigation.movementPoints.length,
          estimatedTimeRemaining: remainingPoints // seconds remaining
        });

        navigation.currentIndex++;
        
      } catch (error) {
        console.error('Error updating user location:', error);
      }
      
    }, 1000); // 1 second interval

    activeNavigations.set(userId, navigation);
    
    res.json({ 
      success: true, 
      message: 'Navigation started',
      totalPoints: movementPoints.length 
    });

  } catch (error) {
    console.error('Error starting navigation:', error);
    res.status(500).json({ error: 'Failed to start navigation' });
  }
});

// Pause navigation endpoint
app.post('/pauseNavigation', (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!activeNavigations.has(userId)) {
      return res.status(404).json({ error: 'No active navigation found' });
    }
    
    const navigation = activeNavigations.get(userId);
    navigation.status = 'paused';
    
    io.to(userId).emit('navigation-paused');
    
    res.json({ success: true, message: 'Navigation paused' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to pause navigation' });
  }
});

// Resume navigation endpoint
app.post('/resumeNavigation', (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!activeNavigations.has(userId)) {
      return res.status(404).json({ error: 'No active navigation found' });
    }
    
    const navigation = activeNavigations.get(userId);
    navigation.status = 'active';
    
    io.to(userId).emit('navigation-resumed');
    
    res.json({ success: true, message: 'Navigation resumed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to resume navigation' });
  }
});


app.post('/stopNavigation', (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!activeNavigations.has(userId)) {
      return res.status(404).json({ error: 'No active navigation found' });
    }
    
    const navigation = activeNavigations.get(userId);
    clearInterval(navigation.interval);
    activeNavigations.delete(userId);
    
    io.to(userId).emit('navigation-stopped');
    
    res.json({ success: true, message: 'Navigation stopped' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to stop navigation' });
  }
});

app.get('/user', async (req, res) => {
    try {
        const user = await User.find();
        res.json(user)
        console.log("user requested")
    }
    catch (err) {
        console.log("Error fetching user", err)
    }
})


app.patch('/updateStatus', async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.body.userId,
            { 'car.chargingStatus': req.body.chargingStatus },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (err) {
        console.error('Error in updating the status', err);
        res.status(500).json({ error: 'Failed to update status' });
    }
});



const startServer = async () => {
    try {
        await connectDb()
        startSimulation()
        server.listen(port, () => {
            console.log(`The backend has been running on server ${port}`)
        })
    } catch (err) {
        console.error("Error Starting server:", err);
        process.exit(1)
    }
}
process.on('SIGINT', async () => {
    await mongoose.connection.close();
    console.log("MONGO DB Connection closed");
    process.exit(0)
})


startServer();