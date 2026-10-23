const fs = require("fs");

const data = JSON.parse(
    fs.readFileSync("./rbi-eval-dataset-v2.json")
);

let q1 = data[0].question;

for(let i = 1 ; i < data.length ; i++){
    if(q1 == data[i].question){
        console.log(data[i]);
    }
    q1 = data[i].question
}