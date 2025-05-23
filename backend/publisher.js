const mqtt = require('mqtt');
const mongoose = require('mongoose');
const client = mqtt.connect('mqtt://localhost:1883');
const User = require('./User')

client.on('connect', () => {
    console.log("Connection with mqtt broker has been established")
})

const startSimulation = () => {
    setInterval(async () => {
        try {
            const vehicles = await User.find();
            for (const vehicle of vehicles) {
                let newSoc;
                let newTemp;
                let statusChanged = false;

                if (vehicle.car.chargingStatus === 'charging') {
                    newTemp = vehicle.car.batteryTemperature_C + Math.random() * 0.5;
                    newSoc = vehicle.car.batterySOC_percent + Math.random() * 1;
                    
                    // Cap charging at 100%
                    if (newSoc >= 100) {
                        newSoc = 100;
                        vehicle.car.chargingStatus = 'idle';
                        statusChanged = true;
                    }
                } else if (vehicle.car.chargingStatus === 'discharging') {
                    newTemp = Math.floor(Math.random() * (30 - 15 + 1)) + 15;
                    newSoc = vehicle.car.batterySOC_percent - Math.random() * 0.02;
                    
                    // Cap discharging at 0%
                    if (newSoc <= 0) {
                        newSoc = 0;
                        vehicle.car.chargingStatus = 'idle';
                        statusChanged = true;
                    }
                } else {
                    newTemp = vehicle.car.batteryTemperature_C;
                    newSoc = vehicle.car.batterySOC_percent;
                }

                vehicle.car.batterySOC_percent = parseFloat(newSoc.toFixed(2));
                vehicle.car.batteryTemperature_C = parseFloat(newTemp.toFixed(2));
                await vehicle.save();

                const topic = `user/${vehicle._id}/data`;
                const message = JSON.stringify(vehicle);
                client.publish(topic, message);

                console.log(`🚗 Simulated + Published data for ${vehicle.car.model},
                    Battery SoC: ${vehicle.car.batterySOC_percent}%,
                    Battery Temp: ${vehicle.car.batteryTemperature_C}°C,
                    Status: ${vehicle.car.chargingStatus}${statusChanged ? ' (Auto-changed to idle)' : ''}`);
            }
        }
        catch (err) {
            console.error('Error publishing data', err);
        }
    }, 1000);
}

module.exports = { startSimulation }