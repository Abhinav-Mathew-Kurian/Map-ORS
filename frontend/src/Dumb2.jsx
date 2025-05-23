import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import axios from 'axios';
import { Box, Typography, Paper, Button, CircularProgress } from '@mui/material';
import 'leaflet-ant-path';

// Fix Leaflet icon issue for default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icon for charging stations
const createStationIcon = () => L.divIcon({
  html: '<div style="font-size: 24px;">⚡</div>', // Lightning bolt emoji
  className: 'station-icon', // Custom class for potential styling
  iconSize: [30, 30], // Size of the icon
  iconAnchor: [15, 15], // Point of the icon which will correspond to marker's location
  popupAnchor: [0, -15] // Point from which the popup should open relative to the iconAnchor
});

// Custom icon for the car marker
const carIcon = L.divIcon({
  html: '<div style="font-size: 24px;">🚗</div>', // Car emoji
  className: 'car-icon', // Custom class for potential styling
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15]
});

// Component to invalidate Leaflet map size on render, ensuring it fills its container
const MapResizer = () => {
  const map = useMap(); // Access the Leaflet map instance
  useEffect(() => {
    map.invalidateSize(); // Invalidate map size when component mounts or map instance changes
  }, [map]);
  return null; // This component doesn't render anything visible
};

// Component to display an animated route with a moving car marker
// Added onNavigationComplete prop to notify parent when animation finishes
const AnimatedRoute = ({ route, duration, onNavigationComplete }) => {
  const map = useMap(); // Access the Leaflet map instance
  const carMarkerRef = useRef(null); // Ref to store the car marker instance
  const routeRef = useRef(null); // Ref to store the ant path polyline instance
  const animationFrameRef = useRef(null); // Ref to store the requestAnimationFrame ID

  useEffect(() => {
    // Ensure route data is valid before proceeding
    if (!route || !route.coordinates || route.coordinates.length < 2) return;
    
    // Clear any previously drawn route and car marker to avoid duplicates
    // The main car marker (user's current location) is handled in MapComp,
    // so we only manage the animated car marker here.
    if (routeRef.current) {
      map.removeLayer(routeRef.current);
    }
    // The animated car marker is created and removed within this effect
    // to ensure it only exists during navigation.
    if (carMarkerRef.current) {
      map.removeLayer(carMarkerRef.current);
    }
    // Cancel any ongoing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    // Create the car marker at the starting point of the route for animation
    carMarkerRef.current = L.marker(route.coordinates[0], { icon: carIcon }).addTo(map);
    
    // Create an animated polyline (ant path) for the route
    const antPath = L.polyline.antPath(route.coordinates, {
      delay: 800, // Delay between dashes
      dashArray: [10, 20], // Pattern of dashes and gaps
      weight: 5, // Thickness of the line
      color: '#0275d8', // Base color of the line
      pulseColor: '#2E86C1', // Color of the "pulse" animation
      paused: false, // Start animation immediately
      reverse: false, // Animation direction
      hardwareAccelerated: true // Use hardware acceleration for smoother animation
    }).addTo(map);
    
    routeRef.current = antPath; // Store the ant path instance
    
    // Calculate the total time for the car to travel the route
    // Default to 300 seconds (5 minutes) if no duration is provided
    const totalTimeMs = (duration || 300) * 1000; 
    const steps = route.coordinates.length - 1; // Number of segments in the route
    const stepTime = steps > 0 ? totalTimeMs / steps : totalTimeMs; // Time per segment
    
    let currentStep = 0; // Keep track of the current segment
    
    // Function to animate the car along the route segments
    const moveCarAlongRoute = () => {
      if (currentStep < steps) {
        const startPoint = L.latLng(route.coordinates[currentStep]);
        const endPoint = L.latLng(route.coordinates[currentStep + 1]);
        
        const startTime = Date.now(); // Time when the current segment animation starts
        
        const animate = () => {
          const now = Date.now();
          const elapsed = now - startTime;
          const t = Math.min(elapsed / stepTime, 1); // Progress (0 to 1) along the current segment
          
          if (t < 1) {
            // Calculate intermediate position using linear interpolation
            const lat = startPoint.lat + t * (endPoint.lat - startPoint.lat);
            const lng = startPoint.lng + t * (endPoint.lng - startPoint.lng);
            
            // Update car marker position
            if (carMarkerRef.current) {
              carMarkerRef.current.setLatLng([lat, lng]);
            }
            
            animationFrameRef.current = requestAnimationFrame(animate); // Continue animation for the current segment
          } else {
            // Move to the next segment once the current one is complete
            currentStep++;
            if (currentStep < steps) {
              moveCarAlongRoute(); // Start animation for the next segment
            } else {
              // All segments completed, notify parent
              if (onNavigationComplete) {
                onNavigationComplete();
              }
            }
          }
        };
        
        animationFrameRef.current = requestAnimationFrame(animate); // Start animation for the first segment
      } else {
        // If there's only one point or no segments (e.g., start = end), still call complete
        if (onNavigationComplete) {
          onNavigationComplete();
        }
      }
    };
    
    moveCarAlongRoute(); // Initiate the car animation
    
    // Cleanup function: remove layers and cancel animation when the component unmounts or dependencies change
    return () => {
      if (routeRef.current) {
        map.removeLayer(routeRef.current);
      }
      if (carMarkerRef.current) {
        map.removeLayer(carMarkerRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [map, route, duration, onNavigationComplete]); // Rerun effect if map, route, duration, or onNavigationComplete changes
  
  return null; // This component doesn't render anything visible
};

// Main Map Component
const MapComp = ({ userId, location, setRouteInfo }) => {
  // State variables for station data, selected route, nearest station, loading, errors, and route details
  const [stationData, setStationData] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [nearestStation, setNearestStation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [routeDistance, setRouteDistance] = useState(null);
  const [routeDuration, setRouteDuration] = useState(null);
  const [currentStation, setCurrentStation] = useState(null);
  // New state to track if navigation is active
  const [isNavigating, setIsNavigating] = useState(false);
  // New state to track current charging status
  const [chargingStatus, setChargingStatus] = useState('idle'); // Default status

  // Default map position if user location is not available (e.g., Madrid)
  const defaultPosition = [40.4168, -3.7038];
  // Determine map center based on user location or default
  const position = location ? [location[1], location[0]] : defaultPosition;

  // Function to handle status updates to the backend
  const handleChangeStatus = useCallback(async (status) => {
    try {
      // Ensure userId is available before making the API call
      if (!userId) {
        console.warn('userId is not available. Cannot update charging status.');
        setError('User ID is missing. Cannot update charging status.');
        return;
      }
      await axios.patch(`http://localhost:5001/updateStatus`, { userId: userId, chargingStatus: status });
      setChargingStatus(status); // Update local state on success
      console.log(`Charging status updated to: ${status}`);
      setError(null); // Clear any previous errors
    } catch (err) {
      console.error('Error updating charging status:', err);
      setError('Failed to update charging status');
    }
  }, [userId]); // Dependency on userId

  // Haversine formula to calculate distance between two lat/lon points in kilometers
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of Earth in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180; // Convert degrees to radians
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  };

  // Callback to find the nearest charging station to the user's current location
  const findNearestStation = useCallback(() => {
    if (!location || !stationData.length) return null; // Require location and station data

    let nearest = null;
    let minDistance = Infinity; // Initialize with a very large distance

    stationData.forEach(station => {
      // Ensure station has valid coordinates
      if (!station.location?.coordinates) return;

      const stationLat = station.location.coordinates[1];
      const stationLon = station.location.coordinates[0];
      const distance = calculateDistance(
        location[1], location[0], // User's location
        stationLat, stationLon    // Station's location
      );

      // Update nearest station if a closer one is found
      if (distance < minDistance) {
        minDistance = distance;
        nearest = { ...station, distance: distance.toFixed(1) }; // Add calculated distance
      }
    });

    return nearest;
  }, [location, stationData]); // Dependencies: user location and station data

  // Callback to fetch a detailed route between two points using OpenRouteService API
  const getRoute = useCallback(async (start, end) => {
    if (!start || !end) {
      setError('Invalid coordinates for route calculation.');
      return null;
    }

    setIsLoading(true); // Set loading state to true

    // Parse coordinates to ensure they are numbers
    const startLat = parseFloat(start[1]);
    const startLon = parseFloat(start[0]);
    const endLat = parseFloat(end[1]);
    const endLon = parseFloat(end[0]);

    try {
      // OpenRouteService API key (replace with a secure method in production)
      const apiKey = '5b3ce3597851110001cf6248097b54aeedec49e9baf1f03cadc701a5'; 
      const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${apiKey}&start=${startLon},${startLat}&end=${endLon},${endLat}`;

      const response = await axios.get(url);
      const data = response.data;

      // Check if route data is available in the API response
      if (data.features?.[0]?.geometry) {
        // Extract coordinates and reformat for Leaflet ([lat, lon])
        const coordinates = data.features[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
        
        // Extract distance and duration from the route properties
        const segment = data.features[0].properties?.segments?.[0];
        const distance = segment?.distance; // Distance in meters
        const duration = segment?.duration; // Duration in seconds

        const routeData = {
          coordinates,
          duration: duration, // Raw duration in seconds
          distance: distance ? Math.round(distance / 1000 * 10) / 10 : null // Convert meters to km, round to 1 decimal
        };

        setSelectedRoute(routeData); // Set the detailed route
        setRouteDistance(routeData.distance);
        setRouteDuration(duration ? Math.round(duration / 60) : null); // Convert seconds to minutes
        setError(null); // Clear any previous errors
        setIsLoading(false); // Clear loading state
        return routeData;
      }

      // If no features/geometry found, throw an error
      throw new Error('No route found in API response.');
    } catch (err) {
      console.error('Failed to fetch detailed route from OpenRouteService:', err);
      
      // Fallback to a straight-line route if API call fails
      const directDistance = calculateDistance(startLat, startLon, endLat, endLon);
      const routeData = {
        coordinates: [[startLat, startLon], [endLat, endLon]], // Straight line between start and end
        duration: null, // No duration available for straight line
        distance: parseFloat(directDistance.toFixed(1))
      };

      setSelectedRoute(routeData);
      setRouteDistance(routeData.distance);
      setRouteDuration(null);
      // Inform the user about the fallback
      setError('Could not fetch detailed route. Showing straight-line distance instead.');
      setIsLoading(false);
      return routeData;
    }
  }, []);

  // Callback to handle clicks on station markers and initiate navigation
  const handleStationClick = useCallback(async (station) => {
    if (!location) {
      setError('User location not available to calculate route.');
      return;
    }

    if (!station.location?.coordinates) {
      setError('Invalid station coordinates for routing.');
      return;
    }

    // Extract station coordinates in [lon, lat] format for OpenRouteService
    const stationCoords = [
      station.location.coordinates[0],
      station.location.coordinates[1]
    ];

    setCurrentStation(station); // Set the currently selected station
    // Get the route from user's location to the clicked station
    const route = await getRoute(location, stationCoords);
    if (route) {
      // Update route information for external display (e.g., in parent component)
      setRouteInfo({
        stationName: station.name,
        duration: route.duration ? Math.round(route.duration / 60) : null,
        distance: route.distance
      });
      // Trigger 'discharging' status when navigation starts
      handleChangeStatus('discharging');
      setIsNavigating(true); // Set navigation active
    } else {
      setError('Failed to calculate route to station.');
    }
  }, [location, getRoute, setRouteInfo, handleChangeStatus]); // Dependencies: user location, getRoute, setRouteInfo, handleChangeStatus

  // Callback for when the car animation completes
  const handleNavigationComplete = useCallback(() => {
    console.log('Navigation completed!');
    handleChangeStatus('idle'); // Set status to 'idle' when destination is reached
    setIsNavigating(false); // Set navigation inactive
  }, [handleChangeStatus]); // Dependency on handleChangeStatus

  // Effect to fetch charging station data from the local backend
  useEffect(() => {
    const fetchStations = async () => {
      try {
        const res = await axios.get('http://localhost:5001/station'); // Assumes a local backend
        setStationData(res.data);
      } catch (err) {
        console.error('Error fetching stations:', err);
        setError('Failed to fetch charging stations from the server.');
      }
    };

    if (userId) fetchStations(); // Fetch stations only if userId is available
  }, [userId]); // Rerun effect if userId changes

  // Effect to find the nearest station and automatically route to it
  useEffect(() => {
    // Only proceed if station data is loaded and user location is available
    // And if not currently navigating
    if (stationData.length > 0 && location && !isNavigating) {
      const nearest = findNearestStation(); // Find the nearest station
      if (nearest) {
        setNearestStation(nearest); // Set the nearest station
        // We don't automatically route on initial load if we want user to click "Navigate"
        // handleStationClick(nearest); // Automatically route to the nearest station
      }
    }
  }, [stationData, location, findNearestStation, isNavigating]); // Dependencies: stationData, location, findNearestStation, isNavigating

  return (
    <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {/* Error message display */}
      {error && (
        <Paper elevation={1} sx={{ p: 2, bgcolor: 'error.light', color: 'error.main', borderRadius: '8px', mb: 4, width: '100%', maxWidth: 'lg', textAlign: 'center' }}>
          <Typography variant="body1">{error}</Typography>
        </Paper>
      )}
      
      {/* Loading indicator display */}
      {isLoading && (
        <Paper elevation={1} sx={{ p: 2, bgcolor: 'info.light', color: 'info.main', borderRadius: '8px', mb: 4, width: '100%', maxWidth: 'lg', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <CircularProgress size={20} color="inherit" />
          <Typography variant="body1">Loading route...</Typography>
        </Paper>
      )}
      
      {/* Route information and status display */}
      <Paper elevation={1} sx={{ p: 2, bgcolor: 'primary.light', color: 'primary.dark', borderRadius: '8px', mb: 4, width: '100%', maxWidth: 'lg', textAlign: 'center' }}>
        <Typography variant="h6">Current Status: <strong style={{ textTransform: 'capitalize' }}>{chargingStatus}</strong></Typography>
        {selectedRoute && currentStation && (
          <>
            <Typography variant="h6" sx={{ mt: 1 }}>Route to: {currentStation.name}</Typography>
            <Typography variant="body1">
              Distance: {routeDistance !== null ? `${routeDistance} km` : 'N/A'} | Time: {routeDuration !== null ? `${routeDuration} min` : 'N/A'}
            </Typography>
          </>
        )}
      </Paper>

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', gap: 2, mb: 4 }}>
        {/* Charge Button: Visible only when not navigating and a station is selected */}
        {!isNavigating && currentStation && (
          <Button
            variant="contained"
            color="primary"
            onClick={() => handleChangeStatus('charging')}
            disabled={chargingStatus === 'charging'} // Disable if already charging
            sx={{ borderRadius: '8px', minWidth: '120px' }}
          >
            Charge Here
          </Button>
        )}
        {/* Stop Charging/Idle Button: Visible when charging or discharging */}
        {(chargingStatus === 'charging' || chargingStatus === 'discharging') && (
          <Button
            variant="contained"
            color="secondary"
            onClick={() => handleChangeStatus('idle')}
            disabled={chargingStatus === 'idle'} // Disable if already idle
            sx={{ borderRadius: '8px', minWidth: '120px' }}
          >
            Stop Activity
          </Button>
        )}
      </Box>

      {/* Leaflet Map Container */}
      <Box sx={{ width: '100%', height: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: 3 }}>
        <MapContainer
          center={position} // Center the map on user's location or default
          zoom={13} // Initial zoom level
          style={{ height: '700px', width: '100%' }} // Map dimensions
        >
          {/* OpenStreetMap Tile Layer */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapResizer /> {/* Ensures map resizes correctly */}

          {/* Static Marker for User's Current Location (Car Icon) */}
          {location && !isNavigating && (
            <Marker position={[location[1], location[0]]} icon={carIcon}>
              <Popup>Your Current Location</Popup>
            </Marker>
          )}

          {/* Render markers for each charging station */}
          {stationData.map(station => {
            if (!station.location?.coordinates) return null; // Skip if coordinates are missing
            
            return (
              <Marker
                key={station._id} // Unique key for React list rendering
                position={[station.location.coordinates[1], station.location.coordinates[0]]} // Leaflet uses [lat, lon]
                icon={createStationIcon()} // Custom station icon
                eventHandlers={{ click: () => handleStationClick(station) }} // Handle click event
              >
                <Popup>
                  <Box sx={{ fontFamily: 'Inter, sans-serif' }}>
                    <Typography variant="h6" component="strong">{station.name}</Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{station.address}</Typography>
                    
                    {/* Display "Nearest Station" label if applicable */}
                    {station === nearestStation && (
                      <Typography variant="body2" sx={{ mt: 1, color: 'success.main', fontWeight: 'medium' }}>Nearest Station</Typography>
                    )}
                    
                    {/* Display distance and estimated time if available and this is the nearest station */}
                    {station === nearestStation && routeDistance !== null && (
                      <Typography variant="body2">Distance: {routeDistance} km</Typography>
                    )}
                    
                    {station === nearestStation && routeDuration !== null && (
                      <Typography variant="body2">Estimated time: {routeDuration} min</Typography>
                    )}
                    
                    <Button
                      variant="contained"
                      color="success"
                      onClick={() => handleStationClick(station)}
                      disabled={isNavigating} // Disable navigation button if already navigating
                      sx={{ mt: 3, borderRadius: '8px' }} // Added rounded corners to button
                    >
                      {isNavigating ? 'Navigating...' : 'Navigate Here'}
                    </Button>
                  </Box>
                </Popup>
              </Marker>
            );
          })}
          
          {/* Render the animated route with the car marker */}
          {selectedRoute?.coordinates && (
            <AnimatedRoute 
              route={selectedRoute} 
              duration={selectedRoute.duration} 
              onNavigationComplete={handleNavigationComplete} // Pass the callback
            />
          )}
        </MapContainer>
      </Box>
    </Box>
  );
};

export default MapComp;
