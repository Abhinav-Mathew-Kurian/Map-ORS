import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import axios from 'axios';
import io from 'socket.io-client';
import { 
  Box, 
  Typography, 
  Divider, 
  Button, 
  Paper,
  LinearProgress,
  IconButton,
  Alert
} from '@mui/material';
import { 
  PlayArrow, 
  Pause, 
  Stop, 
  Navigation 
} from '@mui/icons-material';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const carIcon = L.divIcon({
  html: '<div style="font-size: 24px;">🚗</div>',
  className: 'car-icon',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15]
});

const stationIcon = L.divIcon({
  html: '<div style="font-size: 24px;">⚡</div>',
  className: 'station-icon',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15]
});

const MapResizer = () => {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
  }, [map]);
  return null;
};

const MapComp = ({ userId, location, maxDistance, stationLimit }) => {
  const [stationData, setStationData] = useState([]);
  const [routeData, setRouteData] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(location);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [navigationStatus, setNavigationStatus] = useState({
    active: false,
    status: 'idle', 
    progress: 0,
    estimatedTimeRemaining: 0
  });
  const [selectedStation, setSelectedStation] = useState(null);
  const [alert, setAlert] = useState(null);

  const socketRef = useRef(null);
  const mapRef = useRef(null);

  const defaultPosition = [40.4168, -3.7038];
  const mapCenter = currentLocation ? [currentLocation[1], currentLocation[0]] : defaultPosition;

  // Initialize WebSocket connection
  useEffect(() => {
    socketRef.current = io('http://localhost:5001');
    
    socketRef.current.emit('join-user', userId);

 
    socketRef.current.on('location-update', (data) => {
      setCurrentLocation(data.position);
      setNavigationStatus(prev => ({
        ...prev,
        progress: data.progress,
        estimatedTimeRemaining: data.estimatedTimeRemaining
      }));
    });


    socketRef.current.on('navigation-completed', (data) => {
      setAlert({ type: 'success', message: data.message });
      setNavigationStatus(prev => ({
        ...prev,
        active: false,
        status: 'idle',
        progress: 100
      }));
      setTimeout(() => setAlert(null), 5000);
    });

    socketRef.current.on('navigation-paused', () => {
      setNavigationStatus(prev => ({ ...prev, status: 'paused' }));
    });

    socketRef.current.on('navigation-resumed', () => {
      setNavigationStatus(prev => ({ ...prev, status: 'active' }));
    });

    socketRef.current.on('navigation-stopped', () => {
      setNavigationStatus({
        active: false,
        status: 'idle',
        progress: 0,
        estimatedTimeRemaining: 0
      });
      setRouteCoordinates([]);
      setRouteData(null);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [userId]);

  // Fetch stations
  useEffect(() => {
    const fetchStations = async () => {
      try {
        if (!location) {
          console.log("No Location Data from User to fetch stations.");
          return;
        }

        const userLng = location[0];
        const userLat = location[1];

        const response = await axios.get('http://localhost:5001/station', {
          params: {
            lng: userLng,
            lat: userLat,
            maxDistance: maxDistance,
            limit: stationLimit
          }
        });
        setStationData(response.data);
      } catch (err) {
        console.error("Error fetching station data:", err);
      }
    };

    fetchStations();
  }, [location, maxDistance, stationLimit]);

  const handleFindRoute = async (endLat, endLng, stationData) => {
    if (!currentLocation) {
      setAlert({ type: 'error', message: 'User location not available for navigation.' });
      return;
    }

    const startLng = currentLocation[0];
    const startLat = currentLocation[1];

    try {
      const response = await axios.get('http://localhost:5001/getRoute', {
        params: {
          startLat: startLat,
          startLng: startLng,
          endLat: endLat,
          endLng: endLng,
          userId: userId
        }
      });

      const data = response.data;
      setRouteData(data);
      setSelectedStation(stationData);
      

      const leafletCoords = data.features[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
      setRouteCoordinates(leafletCoords);
      
      setAlert({ type: 'success', message: 'Route found! Click Navigate to start navigation.' });
      setTimeout(() => setAlert(null), 3000);
      
    } catch (error) {
      console.error("Error fetching route:", error);
      setAlert({ type: 'error', message: 'Failed to find route. Please try again.' });
      setTimeout(() => setAlert(null), 3000);
    }
  };

  const handleStartNavigation = async () => {
    if (!routeData) {
      setAlert({ type: 'error', message: 'No route data available.' });
      return;
    }

    try {
      const response = await axios.post('http://localhost:5001/startNavigation', {
        userId: userId,
        routeId: routeData.routeId
      });

      if (response.data.success) {
        setNavigationStatus({
          active: true,
          status: 'active',
          progress: 0,
          estimatedTimeRemaining: routeData.estimatedDuration
        });
        setAlert({ type: 'success', message: 'Navigation started!' });
        setTimeout(() => setAlert(null), 3000);
      }
    } catch (error) {
      console.error("Error starting navigation:", error);
      setAlert({ type: 'error', message: 'Failed to start navigation.' });
      setTimeout(() => setAlert(null), 3000);
    }
  };

  const handlePauseNavigation = async () => {
    try {
      await axios.post('http://localhost:5001/pauseNavigation', { userId });
    } catch (error) {
      console.error("Error pausing navigation:", error);
    }
  };

  const handleResumeNavigation = async () => {
    try {
      await axios.post('http://localhost:5001/resumeNavigation', { userId });
    } catch (error) {
      console.error("Error resuming navigation:", error);
    }
  };

  const handleStopNavigation = async () => {
    try {
      await axios.post('http://localhost:5001/stopNavigation', { userId });
    } catch (error) {
      console.error("Error stopping navigation:", error);
    }
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100vh' }}>
      {/* Alert Messages */}
      {alert && (
        <Alert 
          severity={alert.type} 
          sx={{ 
            position: 'absolute', 
            top: 20, 
            left: 20, 
            right: 20, 
            zIndex: 1000 
          }}
        >
          {alert.message}
        </Alert>
      )}

      {/* Navigation Control Panel */}
      {(routeData || navigationStatus.active) && (
        <Paper 
          elevation={3} 
          sx={{ 
            position: 'absolute', 
            top: alert ? 90 : 20, 
            right: 20, 
            p: 2, 
            zIndex: 1000,
            minWidth: 300
          }}
        >
          <Typography variant="h6" gutterBottom>
            Navigation Control
          </Typography>
          
          {selectedStation && (
            <Typography variant="body2" color="text.secondary" gutterBottom>
              To: {selectedStation.name}
            </Typography>
          )}

          {navigationStatus.active && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                Progress: {navigationStatus.progress.toFixed(1)}%
              </Typography>
              <LinearProgress 
                variant="determinate" 
                value={navigationStatus.progress} 
                sx={{ mb: 1 }}
              />
              <Typography variant="body2" color="text.secondary">
                ETA: {formatTime(navigationStatus.estimatedTimeRemaining)}
              </Typography>
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {!navigationStatus.active && routeData && (
              <Button
                variant="contained"
                color="primary"
                startIcon={<Navigation />}
                onClick={handleStartNavigation}
                size="small"
              >
                Navigate
              </Button>
            )}

            {navigationStatus.active && navigationStatus.status === 'active' && (
              <IconButton
                color="warning"
                onClick={handlePauseNavigation}
                size="small"
              >
                <Pause />
              </IconButton>
            )}

            {navigationStatus.active && navigationStatus.status === 'paused' && (
              <IconButton
                color="success"
                onClick={handleResumeNavigation}
                size="small"
              >
                <PlayArrow />
              </IconButton>
            )}

            {navigationStatus.active && (
              <IconButton
                color="error"
                onClick={handleStopNavigation}
                size="small"
              >
                <Stop />
              </IconButton>
            )}
          </Box>
        </Paper>
      )}

      {/* Map */}
      <div style={{ 
        width: '100%', 
        height: '100vh', 
        borderRadius: '12px', 
        overflow: 'hidden', 
        boxShadow: '0 4px 8px rgba(0,0,0,0.1)' 
      }}>
        <MapContainer
          center={mapCenter}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          ref={mapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapResizer />

          {/* User Location Marker */}
          {currentLocation && (
            <Marker position={[currentLocation[1], currentLocation[0]]} icon={carIcon}>
              <Popup>Your Current Location</Popup>
            </Marker>
          )}

          {/* Route Polyline */}
          {routeCoordinates.length > 0 && (
            <Polyline
              positions={routeCoordinates}
              color="blue"
              weight={5}
              opacity={0.7}
            />
          )}

          {/* Station Markers */}
          {stationData.map(station => (
            <Marker
              key={station._id}
              position={[station.location.coordinates[1], station.location.coordinates[0]]}
              icon={stationIcon}
            >
              <Popup>
                <Box sx={{ p: 1, minWidth: 200 }}>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    {station.name}
                  </Typography>
                  <Divider />
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {station.address}
                  </Typography>
                  
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => handleFindRoute(
                        station.location.coordinates[1],
                        station.location.coordinates[0],
                        station
                      )}
                      disabled={navigationStatus.active}
                    >
                      Find Route
                    </Button>
                  </Box>
                </Box>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </Box>
  );
};

export default MapComp;