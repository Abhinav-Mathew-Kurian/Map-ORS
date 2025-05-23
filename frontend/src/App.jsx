import React from 'react'
import MainLayout from './MainLayout'
import { VehicleProvider } from './VehicleContext';
import useMqtt from './useMqtt';


const App = () => {
  function MqttHandler() {
    useMqtt();
    return null;
  }
  return (<VehicleProvider>
    <MqttHandler />
    <MainLayout />
  </VehicleProvider>
  )
}

export default App