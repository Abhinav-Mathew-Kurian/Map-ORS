require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose')
const cors = require('cors')
const { startSimulation } = require('./publisher')
const Station = require('./Station')
const User = require('./User')
const Route =require('./Route')
const axios =require('axios')

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
        
        console.log('Request URL:', url);

        const response = await axios.get(url);
        const data = response.data; 
        
        console.log("OpenRouteService Response (full):", JSON.stringify(data, null, 2));

        const newRoute = new Route({
            userId: userId, 
            type: data.type, 
            bbox: data.bbox,
            features: data.features,
            metadata: data.metadata
        });

        await newRoute.save();
        console.log("Entire ORS Route response saved to MongoDB with ID:", newRoute._id);
        
        res.json(data);

    } catch (err) {
        console.error('Error getting and saving route:', err.message || err);
       
    }
    }
);


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
        // startSimulation()
        app.listen(port, () => {
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