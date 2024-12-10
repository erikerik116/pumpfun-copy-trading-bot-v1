
import Client, {
    CommitmentLevel,
    SubscribeRequest,
    SubscribeUpdate,
    SubscribeUpdateTransaction,
} from "@triton-one/yellowstone-grpc";
import { CompiledInstruction } from "@triton-one/yellowstone-grpc/dist/grpc/solana-storage";
import { ClientDuplexStream } from '@grpc/grpc-js';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import { formatDate } from "./utils/commonFunc";

dotenv.config()

// Constants
const ENDPOINT = process.env.GRPC_ENDPOINT!;
const TOKEN = process.env.GRPC_TOKEN!;
const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMP_FUN_CREATE_IX_DISCRIMINATOR = Buffer.from([24, 30, 200, 40, 5, 28, 7, 119]);
const PUMP_FUN_BUY_IX_DISCRIMINATOR = Buffer.from([102, 6, 61, 18, 1, 218, 235, 234]);
const COMMITMENT = CommitmentLevel.PROCESSED;

const solanaConnection = new Connection(process.env.RPC_ENDPOINT!, 'confirmed');
const keypair = Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY!));
const amount = process.env.BUY_AMOUNT;

const TARGET_ADDRESS = process.env.TARGET_ADDRESS!;
const PURCHASE_PERCENT = Number(process.env.PURCHASE_PERCENT!);
const MAX_LIMIT = Number(process.env.MAX_LIMIT!);

if(!TARGET_ADDRESS) console.log('Target Address is not defined')

if(!PURCHASE_PERCENT || PURCHASE_PERCENT === 0) console.log("Purchase percent is not defined");
if(!MAX_LIMIT || MAX_LIMIT === 0) console.log("Max Limit is not defined");

console.log('========================================= Your Config =======================================')
console.log('Target Wallet Address =====> ', TARGET_ADDRESS);
console.log('Purchase Amount Percent =====> ', `${PURCHASE_PERCENT} %`);
console.log('Max Limit =====> ', `${MAX_LIMIT} SOL \n`);

// Configuration
const FILTER_CONFIG = {
    programIds: [PUMP_FUN_PROGRAM_ID],
    instructionDiscriminators: [PUMP_FUN_BUY_IX_DISCRIMINATOR]
};

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
                accountRequired: [TARGET_ADDRESS],
                failed: false
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
            if (result) {
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

    // Check if buy transaction or not
    const isBuy = checkBuy(data);
    if (!isBuy) {
        return;
    }

    const formattedSignature = convertSignature(transaction.signature);

    const { mint, accountIndex } = getMintAccount(data);

    if (mint && accountIndex) {
        isStopped = true; // Set the flag to prevent further handling
        console.log("======================================💊 New Buy Transaction Detected!======================================", await formatDate());
        console.log("Signature => ", `https://solscan.io/tx/${formattedSignature.base58}`);
        const tokenAmount = getBalanceChange(data);
        const solAmount = getSolChange(data, accountIndex)
        console.log("Buy Amount => ", getBalanceChange(data))
        console.log("Detail => ", `Bought ${tokenAmount} of ${mint} token with ${solAmount} sol \n`);

        const buyAmount = solAmount * PURCHASE_PERCENT / 100;
        const purchase = (Math.floor(buyAmount * 10 ** 9)) / 10 ** 9;
        console.log("🚀 ~ handleData ~ purchase:", purchase)
        if (purchase > MAX_LIMIT) {
            console.log("Going to skip this transaction!")
            return true
        }
        console.log("Going to start buy ", `${mint} token of ${purchase} sol`);

        const mint_pub = new PublicKey(mint);
        // Buy/Sell Funtion
    }

    return true;
}

// Check token balance change of target wallet
const getBalanceChange = (data: SubscribeUpdate) => {
    let preBalance = 0;
    let postBalance = 0;
    const preAccounts = data.transaction?.transaction?.meta?.preTokenBalances;
    const postAccounts = data.transaction?.transaction?.meta?.postTokenBalances;

    const preAccount = preAccounts?.filter((account: any, i: number) => {
        if (account.owner === TARGET_ADDRESS) {
            return true
        } else {
            return false
        }
    })

    const postAccount = postAccounts?.filter((account: any, i: number) => {
        if (account.owner === TARGET_ADDRESS) {
            return true
        } else {
            return false
        }
    })

    if (preAccount && preAccount.length !== 0) {
        preBalance = Number(preAccount[0].uiTokenAmount?.amount)
    }

    if (postAccount && postAccount.length !== 0) {
        postBalance = Number(postAccount[0].uiTokenAmount?.amount)
    }

    return (postBalance - preBalance) / 10 ** 6
}

// Check buy transaction
const checkBuy = (data: SubscribeUpdate) => {
    const isBuy = data.transaction?.transaction?.meta?.logMessages.toString().includes('Program log: Instruction: Buy');
    if (isBuy) {
        return true
    } else {
        false
    }
}

// Get Token mint
const getMintAccount = (data: SubscribeUpdate) => {
    const tokenAccount = data.transaction?.transaction?.meta?.preTokenBalances.filter((preToken) => {
        if (preToken.accountIndex === 1) {
            return false
        } else {
            return true
        }
    })
    if (tokenAccount && tokenAccount.length !== 0) {
        return {
            mint: tokenAccount[0].mint,
            accountIndex: tokenAccount[0].accountIndex
        }
    } else {
        return {
            mint: null,
            accountIndex: null
        }
    }
}

// Get sol balance change of target wallet
const getSolChange = (data: SubscribeUpdate, accountIndex: number) => {
    const preSolBalance = data.transaction?.transaction?.meta?.preBalances[accountIndex - 1];
    const postBalance = data.transaction?.transaction?.meta?.postBalances[accountIndex - 1];

    const change = (Number(postBalance) - Number(preSolBalance)) / 10 ** 9;

    return change
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

function matchesInstructionDiscriminator(ix: CompiledInstruction): boolean {
    return ix?.data && FILTER_CONFIG.instructionDiscriminators.some(discriminator =>
        Buffer.from(discriminator).equals(ix.data.slice(0, 8))
    );
}

main().catch((err) => {
    console.error('Unhandled error in main:', err);
    process.exit(1);
});
