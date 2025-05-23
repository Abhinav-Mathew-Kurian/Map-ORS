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
  Button
} from '@mui/material';

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

// Modified MapUpdater to only center when explicitly requested
const MapUpdater = ({ center, shouldCenter }) => {
  const map = useMap();
  useEffect(() => {
    if (center && shouldCenter) {
      map.setView(center, 13);
    }
  }, [map, center, shouldCenter]);
  return null;
};

const MapComp = ({ userId, location, maxDistance, stationLimit, setRouteData, setSelectedStation, navigationStatus }) => {
  const [stationData, setStationData] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(location);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [shouldCenterMap, setShouldCenterMap] = useState(true); // Control map centering

  const socketRef = useRef(null);
  const mapRef = useRef(null);

  const defaultPosition = [40.4168, -3.7038];
  const mapCenter = currentLocation ? [currentLocation[1], currentLocation[0]] : defaultPosition;

  // Update current location when location prop changes
  useEffect(() => {
    const isNewUser = currentLocation && location && (
      currentLocation[0] !== location[0] || 
      currentLocation[1] !== location[1]
    );
    
    setCurrentLocation(location);
    
    // Only center map if this is a new user or initial load
    if (isNewUser || !currentLocation) {
      setShouldCenterMap(true);
    }
    
    // Clear route when user changes
    setRouteCoordinates([]);
    setRouteData(null);
    setSelectedStation(null);
  }, [location, setRouteData, setSelectedStation]);

  // Reset shouldCenterMap after it's been used
  useEffect(() => {
    if (shouldCenterMap) {
      const timer = setTimeout(() => {
        setShouldCenterMap(false);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [shouldCenterMap]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!userId) return;

    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    socketRef.current = io('http://localhost:5001');
    socketRef.current.emit('join-user', userId);

    socketRef.current.on('location-update', (data) => {
      // Update location without centering the map
      setCurrentLocation(data.position);
    });

    socketRef.current.on('navigation-stopped', () => {
      setRouteCoordinates([]);
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
          setStationData([]);
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
        setStationData([]);
      }
    };

    fetchStations();
  }, [location, maxDistance, stationLimit]);

  const handleFindRoute = async (endLat, endLng, stationData) => {
    if (!currentLocation) return;

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
      
    } catch (error) {
      console.error("Error fetching route:", error);
    }
  };

  // Function to center map on user location manually
  const centerOnUser = () => {
    setShouldCenterMap(true);
  };

  return (
    <Box sx={{ position: 'relative', width: '100%', height: '100vh' }}>
      {/* Optional: Add a button to center on user location */}
      <Box sx={{ 
        position: 'absolute', 
        top: 10, 
        right: 10, 
        zIndex: 1000,
        backgroundColor: 'white',
        borderRadius: 1,
        boxShadow: 1
      }}>
        <Button 
          variant="contained" 
          size="small" 
          onClick={centerOnUser}
          disabled={!currentLocation}
        >
          📍 My Location
        </Button>
      </Box>

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
          <MapUpdater center={mapCenter} shouldCenter={shouldCenterMap} />

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