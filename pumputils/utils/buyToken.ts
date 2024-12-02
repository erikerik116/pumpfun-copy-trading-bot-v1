import * as token from "@solana/spl-token";
import * as web3 from "@solana/web3.js";
import getBondingCurvePDA from "./getBondingCurvePDA";
import tokenDataFromBondingCurveTokenAccBuffer from "./tokenDataFromBondingCurveTokenAccBuffer";
import getBuyPrice from "./getBuyPrice";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import { BN } from "bn.js";
import { PumpFun } from "../idl/pump-fun";
import IDL from "../idl/pump-fun.json";
import wait from "./wait";
import getBondingCurveTokenAccountWithRetry from "./getBondingCurveTokenAccountWithRetry";
import { Connection, SystemProgram, TransactionMessage } from "@solana/web3.js";
import { executeJitoTx } from "../../utils/jito";
import { formatDate } from "../..";

const BOANDING_CURVE_ACC_RETRY_AMOUNT = 20;
const BOANDING_CURVE_ACC_RETRY_DELAY = 10;


interface Payload {
  transaction: TransactionMessages;
}

interface TransactionMessages {
  content: string;
}

async function buyToken(
  mint: web3.PublicKey,
  connection: web3.Connection,
  keypair: web3.Keypair,
  solAmount: number,
  slippage: number,
  priorityFee?: number
) {
  try {
    console.time('timetrack');
    console.time('1');
    console.time('2');
    console.time('3');
    console.time('4');
    console.time('5');
    console.time('6');
    // Load Pumpfun provider
    const provider = new AnchorProvider(connection, new Wallet(keypair), {
      commitment: "processed",
    });
    const program = new Program<PumpFun>(IDL as PumpFun, provider);

    // Create transaction
    const transaction = new web3.Transaction();

    

    console.timeEnd('1');
    // Get/Create token account
    const associatedUser = await token.getAssociatedTokenAddress(mint, keypair.publicKey, false);

      // await token.getAccount(connection, associatedUser, "finalized");
      transaction.add(
        token.createAssociatedTokenAccountInstruction(keypair.publicKey, associatedUser, keypair.publicKey, mint)
      );
    // console.log("Account created/loaded");

    // Buy token on Pump.fun
    // console.log("Buying");
    const programId = new web3.PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

    const bondingCurve = getBondingCurvePDA(mint, programId);
    const associatedBondingCurve = await token.getAssociatedTokenAddress(mint, bondingCurve, true);
    console.timeEnd('2');
    // let BondingCurveTokenAccount: web3.AccountInfo<Buffer> | null = null;

    const bondingCurveTokenAccount = await getBondingCurveTokenAccountWithRetry(
      connection,
      bondingCurve,
      BOANDING_CURVE_ACC_RETRY_AMOUNT,
      BOANDING_CURVE_ACC_RETRY_DELAY
    );
    console.timeEnd('3');

    if (bondingCurveTokenAccount === null) {
      throw new Error("Bonding curve account not found");
    }
    const tokenData = tokenDataFromBondingCurveTokenAccBuffer(bondingCurveTokenAccount!.data);
    if (tokenData.complete) {
      throw new Error("Bonding curve already completed");
    }
    const SLIPAGE_POINTS = BigInt(slippage * 100);
    const solAmountLamp = BigInt(solAmount * web3.LAMPORTS_PER_SOL);
    const buyAmountToken = getBuyPrice(solAmountLamp, tokenData);
    const buyAmountSolWithSlippage = solAmountLamp + (solAmountLamp * SLIPAGE_POINTS) / 10000n;

    const FEE_RECEIPT = new web3.PublicKey("CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM");

    // request a specific compute unit budget
    const modifyComputeUnits = web3.ComputeBudgetProgram.setComputeUnitLimit({
      units: 100000,
    });

    // set the desired priority fee
    const addPriorityFee = web3.ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: typeof priorityFee === "number" ? priorityFee * 1000000000 : 0.0001 * 1000000000,
      // microLamports: 0.005 * 1000000000,
    });

    console.time('blockhash')
    const latestBlockhash = await connection.getLatestBlockhash()
    console.timeEnd('blockhash')
    console.timeEnd('5');

    transaction
      .add(modifyComputeUnits)
      .add(addPriorityFee)
      .add(
        await program.methods
          .buy(new BN(buyAmountToken.toString()), new BN(buyAmountSolWithSlippage.toString()))
          .accounts({
            feeRecipient: FEE_RECEIPT,
            mint: mint,
            associatedBondingCurve: associatedBondingCurve,
            associatedUser: associatedUser,
            user: keypair.publicKey,
          })
          .transaction()
      );

    transaction.feePayer = keypair.publicKey;
    transaction.recentBlockhash = latestBlockhash.blockhash;

    const isJito = process.env.IS_JITO === 'true';

    
    console.timeEnd('timetrack');

    if (isJito) {

      const messageV0 = new TransactionMessage({
        payerKey: keypair.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: transaction.instructions,
      }).compileToV0Message()

      const versionedTx = new web3.VersionedTransaction(messageV0);
      versionedTx.sign([keypair]);

      console.log('executeJito Tx current time => ', formatDate())
      console.time('executeJitoTx');
      const sig = await executeJitoTx([versionedTx], keypair, 'confirmed');
      console.timeEnd('executeJitoTx');
      return sig;

    } else {

      const stakeConnection = new Connection('https://staked.helius-rpc.com?api-key=e2cc6225-fae1-4f90-a6b1-5684f49dec62', 'confirmed')
      
      const txSig = await stakeConnection.sendTransaction(transaction, [keypair], { skipPreflight: true, preflightCommitment: 'confirmed' });
      const confirmSig = await stakeConnection.confirmTransaction(txSig, 'confirmed');

      // console.log('confirm sig => ', confirmSig.value.err);

      // console.log(`Sending transaction for buying ${mint.toString()}, ${new Date().toISOString()}`);
      // const sig = await web3.sendAndConfirmTransaction(connection, transaction, [keypair], { skipPreflight: true, commitment: "confirmed", preflightCommitment: 'confirmed' });
      console.log("🚀 ~ sig:", txSig)
      return txSig;
    }

  } catch (error) {
    console.error(error);
    return false
  }
}


export default buyToken;
