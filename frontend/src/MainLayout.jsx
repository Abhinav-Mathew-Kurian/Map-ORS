import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import MapComp from './MapComp';
import { useVehicleData } from './VehicleContext';

import { 
  Box, 
  Typography, 
  CircularProgress, 
  Alert, 
  Paper, 
  Divider, 
  Button,
  TextField,
  Slider,
  LinearProgress,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import { 
  PlayArrow, 
  Pause, 
  Stop, 
  Navigation 
} from '@mui/icons-material';

const MainLayout = () => {
  const [allUsers, setAllUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userData, setUserData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [maxDistance, setMaxDistance] = useState(5);
  const [stationLimit, setStationLimit] = useState(2);
  const [navigationStatus, setNavigationStatus] = useState({
    active: false,
    status: 'idle', 
    progress: 0,
    estimatedTimeRemaining: 0
  });
  const [routeData, setRouteData] = useState(null);
  const [selectedStation, setSelectedStation] = useState(null);
  const [showChargeButton, setShowChargeButton] = useState(false);
  
  const { vehicles } = useVehicleData();
  const socketRef = useRef(null);

  // Fetch all users initially
  useEffect(() => {
    const fetchAllUsers = async () => {
      setIsLoading(true);
      try {
        const res = await axios.get('http://localhost:5001/user');
        setAllUsers(res.data);
        if (res.data.length > 0) {
          setSelectedUserId(res.data[0]._id);
        }
        setIsLoading(false);
      } catch (err) {
        console.error('Error fetching users:', err);
        setError('Failed to fetch users');
        setIsLoading(false);
      }
    };

    fetchAllUsers();
  }, []);

  // Fetch selected user data
  useEffect(() => {
    if (!selectedUserId) return;

    const selectedUser = allUsers.find(user => user._id === selectedUserId);
    if (selectedUser) {
      setUserData([selectedUser]);
    }
  }, [selectedUserId, allUsers]);

  const userId = userData[0]?.userId;
  const realUserId = userData[0]?._id;
  const location = userData[0]?.location?.coordinates;
  const liveCarData = realUserId && vehicles[realUserId] ? vehicles[realUserId] : null;
  const carData = liveCarData?.car || userData[0]?.car;

  // Initialize WebSocket connection
  useEffect(() => {
    if (!userId) return;

    socketRef.current = io('http://localhost:5001');
    socketRef.current.emit('join-user', userId);

    socketRef.current.on('navigation-completed', (data) => {
      setNavigationStatus(prev => ({
        ...prev,
        active: false,
        status: 'idle',
        progress: 100
      }));
      setShowChargeButton(true);
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
      setRouteData(null);
    });

    socketRef.current.on('location-update', (data) => {
      setNavigationStatus(prev => ({
        ...prev,
        progress: data.progress,
        estimatedTimeRemaining: data.estimatedTimeRemaining
      }));
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [userId]);

  // Auto-idle when battery reaches 100%
  useEffect(() => {
    if (carData?.batterySOC_percent === 100 && carData?.chargingStatus === 'charging') {
      handleChangeStatus('idle');
    }
  }, [carData?.batterySOC_percent, carData?.chargingStatus]);

  const handleChangeStatus = async (status) => {
    try {
      await axios.patch(`http://localhost:5001/updateStatus`, {
        userId: realUserId,
        chargingStatus: status
      });
    } catch (err) {
      console.error('Error updating charging status:', err);
      setError('Failed to update charging status');
    }
  };

  const handleStartNavigation = async () => {
    if (!routeData) return;

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
        await handleChangeStatus('discharging');
      }
    } catch (error) {
      console.error("Error starting navigation:", error);
    }
  };

  const handlePauseNavigation = async () => {
    try {
      await axios.post('http://localhost:5001/pauseNavigation', { userId });
      await handleChangeStatus('idle');
    } catch (error) {
      console.error("Error pausing navigation:", error);
    }
  };

  const handleResumeNavigation = async () => {
    try {
      await axios.post('http://localhost:5001/resumeNavigation', { userId });
      await handleChangeStatus('discharging');
    } catch (error) {
      console.error("Error resuming navigation:", error);
    }
  };

  const handleStopNavigation = async () => {
    try {
      await axios.post('http://localhost:5001/stopNavigation', { userId });
      await handleChangeStatus('idle');
    } catch (error) {
      console.error("Error stopping navigation:", error);
    }
  };

  const handleStartCharging = async () => {
    await handleChangeStatus('charging');
    setShowChargeButton(false);
  };

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      {/* Sidebar */}
      <Box 
        sx={{ 
          width: 300, 
          flexShrink: 0,
          borderRight: '1px solid #eee',
          p: 3,
          overflow: 'auto'
        }}
      >
        <Typography variant="h5" fontWeight="bold" gutterBottom>
          EV Charging Stations
        </Typography>
        
        {/* User Selection Dropdown */}
        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel>Select User</InputLabel>
          <Select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            label="Select User"
          >
            {allUsers.map((user) => (
              <MenuItem key={user._id} value={user._id}>
                {user.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        
        {isLoading && <CircularProgress />}
        {error && <Alert severity="error">{error}</Alert>}
        
        {!isLoading && userData.length > 0 && (
          <Box mt={3}>
            <Paper elevation={3} sx={{ p: 3, mb: 4 }}>
              <Typography variant="h6">
                Welcome, {userData[0].name}
              </Typography>
              <Divider sx={{ my: 2 }} />
              
              {carData && (
                <>
                  <Typography variant="subtitle1" fontWeight="medium">
                    {carData.make} {carData.model}
                  </Typography>
                  
                  {/* Battery Status */}
                  <Box mt={3}>
                    <Typography variant="body2" color="text.secondary">
                      Battery Status
                    </Typography>
                    <Box 
                      sx={{ 
                        mt: 1,
                        p: 2, 
                        border: '1px solid #e0e0e0',
                        borderRadius: 2,
                        bgcolor: '#f9f9f9'
                      }}
                    >
                      <Box sx={{ position: 'relative', height: 12, bgcolor: '#e0e0e0', borderRadius: 1 }}>
                        <Box 
                          sx={{ 
                            position: 'absolute', 
                            height: '100%', 
                            width: `${carData.batterySOC_percent}%`, 
                            bgcolor: carData.batterySOC_percent > 20 ? '#4caf50' : '#f44336',
                            borderRadius: 1
                          }} 
                        />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                        <Typography variant="h6">{carData.batterySOC_percent}%</Typography>
                      </Box>
                    </Box>
                  </Box>
                  
                  {/* Temperature */}
                  {carData.batteryTemperature_C && (
                    <Box mt={3}>
                      <Typography variant="body2" color="text.secondary">
                        Battery Temperature
                      </Typography>
                      <Box 
                        sx={{ 
                          mt: 1,
                          display: 'flex',
                          alignItems: 'center',
                          p: 2, 
                          border: '1px solid #e0e0e0',
                          borderRadius: 2,
                          bgcolor: '#f9f9f9'
                        }}
                      >
                        <Typography variant="h6">{carData.batteryTemperature_C}°C</Typography>
                      </Box>
                    </Box>
                  )}
                  
                  {/* Charging Status */}
                  <Box mt={3}>
                    <Typography variant="body2" color="text.secondary">
                      Charging Status
                    </Typography>
                    <Box 
                      sx={{ 
                        mt: 1,
                        p: 2, 
                        border: '1px solid #e0e0e0',
                        borderRadius: 2,
                        bgcolor: '#f9f9f9',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <Typography 
                        variant="h6" 
                        sx={{ 
                          color: 
                            carData.chargingStatus === 'charging' ? '#4caf50' : 
                            carData.chargingStatus === 'discharging' ? '#f44336' : 
                            '#757575'
                        }}
                      >
                        {carData.chargingStatus || 'idle'}
                      </Typography>
                    </Box>
                  </Box>
                  
                  {/* Control Buttons */}
                  <Box mt={3} sx={{ display: 'flex', gap: 2 }}>
                    <Button 
                      variant="contained" 
                      color="error"
                      onClick={() => handleChangeStatus('discharging')}
                      disabled={carData.chargingStatus === 'discharging' || navigationStatus.active}
                      sx={{ flex: 1 }}
                    >
                      Discharge
                    </Button>
                    <Button 
                      variant="outlined" 
                      onClick={() => handleChangeStatus('idle')}
                      disabled={carData.chargingStatus === 'idle' || navigationStatus.active}
                      sx={{ flex: 1 }}
                    >
                      Idle
                    </Button>
                  </Box>

                  {/* Charge Button - Only show when navigation completed */}
                  {showChargeButton && (
                    <Box mt={2}>
                      <Button 
                        variant="contained" 
                        color="success"
                        onClick={handleStartCharging}
                        fullWidth
                      >
                        Start Charging
                      </Button>
                    </Box>
                  )}
                </>
              )}
            </Paper>

            {/* Navigation Control Panel */}
            {(routeData || navigationStatus.active) && (
              <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
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

            {/* Station Controls */}
            <Paper elevation={3} sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Station Search
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              <Box mb={3}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Max Distance: {maxDistance}km
                </Typography>
                <Slider
                  value={maxDistance}
                  onChange={(e, newValue) => setMaxDistance(newValue)}
                  min={1}
                  max={1000}
                  step={1}
                  marks
                  valueLabelDisplay="auto"
                />
              </Box>
              
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Station Limit
                </Typography>
                <TextField
                  type="number"
                  value={stationLimit}
                  onChange={(e) => setStationLimit(parseInt(e.target.value) || 1)}
                  inputProps={{ min: 1, max: 20 }}
                  size="small"
                  fullWidth
                />
              </Box>
            </Paper>
          </Box>
        )}
      </Box>
      
      {/* Map Content */}
      <Box sx={{ flexGrow: 1, height: '100%', overflow: 'hidden' }}>
        {location ? (
          <MapComp 
            userId={userId} 
            location={location}
            maxDistance={maxDistance}
            stationLimit={stationLimit}
            setRouteData={setRouteData}
            setSelectedStation={setSelectedStation}
            navigationStatus={navigationStatus}
          />
        ) : (
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '100%',
            flexDirection: 'column'
          }}>
            <CircularProgress />
            <Typography variant="body1" sx={{ mt: 2 }}>
              Loading map...
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default MainLayout;