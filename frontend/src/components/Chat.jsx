import {useState} from 'react'

function Chat(){
    const [question , setQuestion] = useState("");
    const [answer , setAnswer] = useState("");

    const askQuestion = async () =>{
        console.log("Called model and waiting for response");
        // call the api and get response from backend
        const response = await fetch("http://localhost:5000/api/ask",{
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                question: question
            })
        });

        console.log("Got response and converting to json..")
        // convert the response into json format
        const data = await response.json();

        console.log("Converted to json");

        setAnswer(data.answer);
    }

    return(
        <div>
            <h1> Hello World</h1>
            <input 
            type="text"
            placeholder="Ask a compliance question..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}/>

            <button onClick={askQuestion}>Ask</button>

            {answer && <p>{answer}</p>}

        </div>
    );
}

export default Chat;