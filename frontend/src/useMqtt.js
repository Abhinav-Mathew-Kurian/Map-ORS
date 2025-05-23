
import { useEffect } from 'react';
import mqtt from 'mqtt';
import { useVehicleData } from './VehicleContext';

const useMqtt = () => {
  const { setVehicles } = useVehicleData();

  useEffect(() => {
    const client = mqtt.connect('ws://localhost:9001');

    client.on('connect', () => {
      console.log('✅ Connected to MQTT broker');
      client.subscribe('user/+/data');
    });

    client.on('message', (topic, message) => {
      const payload = JSON.parse(message.toString());
      const id = payload._id;

      setVehicles(prev => ({
        ...prev,
        [id]: payload
      }));
    });

    return () => {
      client.end();
    };
  }, []);
};

export default useMqtt;
