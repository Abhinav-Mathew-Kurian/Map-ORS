import React, { useEffect, useState } from 'react';
import axios from 'axios';
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
  Slider
} from '@mui/material';


const MainLayout = () => {
  const [userData, setUserData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [maxDistance, setMaxDistance] = useState(5);
  const [stationLimit, setStationLimit] = useState(2);
  const { vehicles } = useVehicleData();
  

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const res = await axios.get('http://localhost:5001/user');
        setUserData(res.data);
        setIsLoading(false);
      } catch (err) {
        console.error('Error fetching user data:', err);
        setError('Failed to fetch user data');
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const userId = userData[0]?.userId;
  const realUserId=userData[0]?._id;
  const location = userData[0]?.location?.coordinates;
  

  const liveCarData = realUserId && vehicles[realUserId] ? vehicles[realUserId] : null;
  

  const carData = liveCarData?.car || userData[0]?.car;
  
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
                  {carData.temperature && (
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
                        <Typography variant="h6">{carData.temperature}°C</Typography>
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
                      disabled={carData.chargingStatus === 'discharging'}
                      sx={{ flex: 1 }}
                    >
                      Discharge
                    </Button>
                    <Button 
                      variant="outlined" 
                      onClick={() => handleChangeStatus('idle')}
                      disabled={carData.chargingStatus === 'idle'}
                      sx={{ flex: 1 }}
                    >
                      Idle
                    </Button>
                  </Box>
                </>
              )}
            </Paper>

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