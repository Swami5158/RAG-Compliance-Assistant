import {useState} from 'react'
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import './Chat.css' 
import CircularProgress from '@mui/material/CircularProgress'

function Chat(){
    const [question , setQuestion] = useState("");
    const [answer , setAnswer] = useState("");
    const [loading,setLoading] = useState(false);

    const clearChat = () =>{
        setAnswer("");
        setQuestion("");
        setLoading(false);
    }
    const askQuestion = async () =>{
        setLoading(true);
        try{
            const response = await fetch("http://localhost:5000/api/ask",{
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    question: question
                })
            });

            // convert the response into json format
            const data = await response.json();
            setAnswer(data.answer);
        }
        catch(error){
            console.log(error);
            setAnswer("Something went wrong while processing your question.");
        }
        finally{
            setLoading(false);
        }        
    }

    return(
        <div>
            <h1>RBI Compliance</h1>
            <div className="user-input">
                <TextField id="filled-basic" label="Ask a compliance question" variant="filled" 
                    sx={{width: 500}}
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) =>{
                        if(e.key == "Enter"){
                            askQuestion();
                        }
                    }}
                />

                <Button variant="contained" onClick={askQuestion}>Ask</Button>
            </div>
            
            <div className="query-answer">
                {loading ? (
                    <>
                        <CircularProgress/>
                        <p>Searching RBI regulatory documents...</p>
                    </>
                    
                    ): (answer && <p>{answer}</p>)
                }
            </div>

            <Button variant="outlined" onClick={clearChat}>Clear</Button>

        </div>
    );
}

export default Chat;