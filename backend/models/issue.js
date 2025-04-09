const mongoose = require('mongoose');
const issueSchema=new mongoose.Schema({
    title:{
        type:String,
        required:true,
    },


    status:{
        type:String,
        enum:['open','closed'],
        default:'open'
    }
})
const Issue=mongoose.model('Issue',issueSchema);
exports=Issue;