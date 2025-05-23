const mongoose=require('mongoose');


const StationSchema = mongoose.Schema({
    name:{
        type:String,
        required:true
    },
    address:{
        type:String,
        required:true
    },
    location:{
        lat:{
            type:Number,
            required:true
        },
        lng:{
            type:Number,
            required:true
        }
    }
});

const Station =mongoose.model('station',StationSchema);
module.exports= Station;