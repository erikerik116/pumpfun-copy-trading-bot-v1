
import Client, {
    CommitmentLevel,
    SubscribeRequest,
    SubscribeUpdate,
    SubscribeUpdateTransaction,
} from "@triton-one/yellowstone-grpc";
import { Message, CompiledInstruction } from "@triton-one/yellowstone-grpc/dist/grpc/solana-storage";
import { ClientDuplexStream } from '@grpc/grpc-js';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { Stream } from "stream";
import buyToken from "./pumputils/utils/buyToken";
import dotenv from 'dotenv';

dotenv.config()

// Constants
const ENDPOINT = "https://grpc.solanavibestation.com";
const TOKEN = "2550b49c90f95efa805508bb77231b58";
const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMP_FUN_CREATE_IX_DISCRIMINATOR = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);
const COMMITMENT = CommitmentLevel.PROCESSED;

console.log('process.env.WEBSOCKET_RPC_ENDPOINT => ', process.env.WEBSOCKET_RPC_ENDPOINT)

const solanaConnection = new Connection(process.env.RPC_ENDPOINT! , 'confirmed');
const keypair = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY!));
const amount = process.env.BUY_AMOUNT;

console.log(process.env.RPC_ENDPOINT);
console.log(keypair.publicKey.toBase58());
console.log(amount)

// Configuration
const FILTER_CONFIG = {
    programIds: [PUMP_FUN_PROGRAM_ID],
    instructionDiscriminators: [PUMP_FUN_CREATE_IX_DISCRIMINATOR]
};

const ACCOUNTS_TO_INCLUDE = [{
    name: "mint",
    index: 0
}];

// Type definitions
interface FormattedTransactionData {
    signature: string;
    slot: string;
    mint: string;
}

// Main function
async function main(): Promise<void> {
    const client = new Client(ENDPOINT, TOKEN, {});
    const stream = await client.subscribe();
    const request = createSubscribeRequest();

    try {
        await sendSubscribeRequest(stream, request);
        console.log('Geyser connection established - watching new Pump.fun mints. \n');
        await handleStreamEvents(stream);
    } catch (error) {
        console.error('Error in subscription process:', error);
        stream.end();
    }
}

// Helper functions
function createSubscribeRequest(): SubscribeRequest {
    return {
        accounts: {},
        slots: {},
        transactions: {
            pumpFun: {
                accountInclude: FILTER_CONFIG.programIds,
                accountExclude: [],
                accountRequired: []
            }
        },
        transactionsStatus: {},
        entry: {},
        blocks: {},
        blocksMeta: {},
        commitment: COMMITMENT,
        accountsDataSlice: [],
        ping: undefined,
    };
}

function sendSubscribeRequest(
    stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>,
    request: SubscribeRequest
): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        stream.write(request, (err: Error | null) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function handleStreamEvents(stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        stream.on('data', async (data) => {
           const result = await handleData(data, stream) 
           if(result){
            stream.end();
            process.exit(1)
           }
        });
        stream.on("error", (error: Error) => {
            console.error('Stream error:', error);
            reject(error);
            stream.end();
        });
        stream.on("end", () => {
            console.log('Stream ended');
            resolve();
        });
        stream.on("close", () => {
            console.log('Stream closed');
            resolve();
        });
    });
}

let isStopped = false;

async function handleData(data: SubscribeUpdate, stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>) {
    if (isStopped) {
        return; // Skip processing if the stream is stopped
    }

    if (!isSubscribeUpdateTransaction(data) || !data.filters.includes('pumpFun')) {
        return;
    }

    const transaction = data.transaction?.transaction;
    const message = transaction?.transaction?.message;

    if (!transaction || !message) {
        return;
    }

    const matchingInstruction = message.instructions.find(matchesInstructionDiscriminator);
    if (!matchingInstruction) {
        return;
    }

    const formattedSignature = convertSignature(transaction.signature);
    const formattedData = formatData(message, formattedSignature.base58, data.transaction.slot);

    if (formattedData) {
        isStopped = true; // Set the flag to prevent further handling
        console.log("======================================💊 New Pump.fun Mint Detected!======================================");
        console.log("Current Time => ", formatDate());
        console.log("Signature => ", `https://solscan.io/tx/${formattedData.signature}`);
        console.log("Mint => ", `https://solscan.io/tx/${formattedData.mint.toString()}`);
        const mintPub = new PublicKey(formattedData.mint.toString());
        console.time('BuyTime');
        const sig = await buyToken(mintPub, solanaConnection, keypair, Number(amount), 1);
        if (sig) {
            console.log("Buy success => ", `https://solscan.io/tx/${sig}`)
        } else {
            console.log("Buy failed!");
            
        }
        console.timeEnd('BuyTime')
        console.log("\n");
        return true;
    }
}

export function formatDate() {
    const options: any = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'UTC',
        timeZoneName: 'short'
    };

    const now = new Date();
    return now.toLocaleString('en-US', options);
}

function isSubscribeUpdateTransaction(data: SubscribeUpdate): data is SubscribeUpdate & { transaction: SubscribeUpdateTransaction } {
    return (
        'transaction' in data &&
        typeof data.transaction === 'object' &&
        data.transaction !== null &&
        'slot' in data.transaction &&
        'transaction' in data.transaction
    );
}

function convertSignature(signature: Uint8Array): { base58: string } {
    return { base58: bs58.encode(Buffer.from(signature)) };
}

function formatData(message: Message, signature: string, slot: string): FormattedTransactionData | undefined {
    const matchingInstruction = message.instructions.find(matchesInstructionDiscriminator);

    if (!matchingInstruction) {
        return undefined;
    }

    const newSig = `https://solscan.io/tx/${signature}`

    const accountKeys = message.accountKeys;
    const includedAccounts = ACCOUNTS_TO_INCLUDE.reduce<Record<string, string>>((acc, { name, index }) => {
        const accountIndex = matchingInstruction.accounts[index];
        const publicKey = accountKeys[accountIndex];
        acc[name] = new PublicKey(publicKey).toBase58();
        return acc;
    }, {});

    const mint = includedAccounts['mint']

    return {
        signature: newSig,
        slot,
        mint
    };
}

function matchesInstructionDiscriminator(ix: CompiledInstruction): boolean {
    return ix?.data && FILTER_CONFIG.instructionDiscriminators.some(discriminator =>
        Buffer.from(discriminator).equals(ix.data.slice(0, 8))
    );
}

main().catch((err) => {
    console.error('Unhandled error in main:', err);
    process.exit(1);
});