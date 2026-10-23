const { env, AutoTokenizer, AutoModelForSequenceClassification } = require('@huggingface/transformers');

env.cacheDir = '/app/.cache';
env.backends.onnx.wasm.numThreads = 8;

const MODEL_NAME = 'Alibaba-NLP/gte-reranker-modernbert-base';

let tokenizer = null;
let model = null;

async function loadModel() {
    if (tokenizer && model) return { tokenizer, model };

    console.log("Loading reranker model...");
    tokenizer = await AutoTokenizer.from_pretrained(MODEL_NAME);
    model = await AutoModelForSequenceClassification.from_pretrained(MODEL_NAME, {
        quantized: true,
    });
    console.log("Reranker model loaded successfully!");
    return { tokenizer, model };
}

function sigmoid(x) {
    return 1 / (1 + Math.exp(-x));
}

async function reranker(query, candidateChunks, topK = 20) {
    if (!candidateChunks || candidateChunks.length === 0) return [];

    const { tokenizer, model } = await loadModel();

    const queries = candidateChunks.map(() => query);
    const texts = candidateChunks.map(chunk => chunk.raw_text);

    const inputs = tokenizer(queries, {
        text_pair: texts,
        padding: true,
        truncation: true,
        max_length: 2048,
    });

    const { logits } = await model(inputs);
    const scores = Array.from(logits.data);

    return candidateChunks
        .map((chunk, i) => ({
            ...chunk,
            rerankScore: sigmoid(scores[i]),
        }))
        .sort((a, b) => b.rerankScore - a.rerankScore)
        .slice(0, 5);
}

// --- Terminal Self-Test Block ---
// if (require.main === module) {
//     (async () => {
//         const { tokenizer } = await loadModel();

//         const testQuery = "What safeguards did the earlier master direction attach to the use of third-party tools that scan a payment ecosystem for unencrypted card data?";
        
//         const testPageText = `g) Card PIN generation and printing should be directly at system connected HSM; h) CVV generation and validation should be done at HSM;  i) Ensure  HSM  is  implemented  with  secure  PIN  block  format  with  controls  to  disable outputting PIN block in weaker format; j) Secure key management for HSMs (such as LMKs, etc.); and k) Security of the physical keys of the HSM device should be properly maintained.  71. REs shall implement the following for improving the security posture of the ATM: a) Implement  security  measures  such  as  BIOS  password,  disabling  USB  ports,  disabling auto-run facility, applying the latest patches of operating system and other softwares, terminal security solution, time-based admin access, etc;    b) Implement anti-skimming and whitelisting solution; and c) Upgrade  all  the  ATMs  with  supported  versions  of  operating  system.  Use  of  ATMs that have unsupported operating systems shall be prohibited.  72. REs  shall  ensure  robust  surveillance/  monitoring  of  card  transactions  (especially  overseas cash withdrawals) and setting up of rules and limits commensurate with their risk appetites. REs shall take up with the card network and/ or ATM network as the case may be, to put in place transaction limits at Card, BIN as well as at the RE level. Such limits shall be mandatorily set at the card network switch itself. Limits could be mandated both for domestic as well as international transactions separately. REs shall put in place transaction control mechanisms with necessary caps  (restrictions  on  transactions),  if  any  of  the  limits  set  as  per  the  above  requirement is breached. A periodic review mechanism of such limits set as per the risk appetite of the RE shall be put in place as per the Board-approved policy. REs  shall  institute  a  mechanism  to  monitor  breaches,  if  any,  on  a  24x7  basis,  including  weekends,  long  holidays  and  put  in  place  a  robust  incident  response  mechanism  to  mitigate  the  fraud  loss,  on  account  of  suspicious  transactions,  if  any.  REs  shall  ensure  that  card  details  of  the  customers  are  not stored in plain text at the RE and its  vendor(s)  locations,  systems  and  applications.  REs  shall  also  ensure  that  the  processing  of  card  details  in readable format is performed in a secure manner to strictly avoid data leakage of sensitive customer information. 73. REs that use card data scanning tools to identify unencrypted (clear text) payments  card data in their ecosystem especially during audits shall adhere to the following  safety measures:  a) Any  tool  (procured  by/  from  a  third-party)  for  the  purpose  of  scanning  of  unencrypted card data should first be tested in a test environment to understand the scope and impact of the tool’s capabilities;  b) The scanning tool should be installed only in the RE's premises on their devices; c) Card data scanning should not be done remotely;`;

//         // Request standard JS arrays using return_tensor: false
//         const fullEncoding = tokenizer(testQuery, {
//             text_pair: testPageText,
//             truncation: false,
//             return_tensor: false
//         });
        
//         console.log(`--- Tokenization Analysis ---`);
//         console.log(`Total Token Count (without truncation): ${fullEncoding.input_ids.length}`);
//         console.log(`Max Length Limit configured: 512\n`);

//         const truncatedEncoding = tokenizer(testQuery, {
//             text_pair: testPageText,
//             truncation: true,
//             max_length: 2048,
//             return_tensor: false
//         });

//         const decodedText = tokenizer.decode(truncatedEncoding.input_ids, { skip_special_tokens: false });
//         console.log(`--- What the Model Sees Now ---`);
//         console.log(decodedText);
//     })();
// }

module.exports = reranker;