
const splToken = require('@solana/spl-token');
const { PublicKey, Keypair, ComputeBudgetProgram, TransactionInstruction, TransactionMessage, VersionedTransaction, SystemProgram, Connection } = require('@solana/web3.js');
const BN = require('bn.js');
const bs58 = require('bs58');

const OPENBOOK_PROGRAM_ID = new PublicKey('srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX');
const RAYDIUM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
const RAYDIUM_PDA = new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1');
const RAYDIUM_MARKET_VAULT_SIGNER = new PublicKey("2TwZm2vF7HWBgrEDYZg5vxA6RWSFMiwGru1gX4TD7CF8");

const JITO_RPC = "https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles";
const JITO_TIP = "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL";



async function jitoSendTx(transaction) {
    const serializedTransaction = transaction.serialize();
    const byteArray = Uint8Array.from(serializedTransaction);
    const base58Encoded = bs58.encode(byteArray);
    
    const headers = {
        'Content-Type': 'application/json'
    };

    const data = {
        "jsonrpc": "2.0",
        "id": 13,
        "method": "sendBundle",
        "params": [[base58Encoded]]
    };
    
    let resp = await fetch(JITO_RPC, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(data)
    })
    
}

async function loadOpenBookAddresses(marketId, connection) {
    // https://github.com/openbook-dex/program/blob/master/dex/src/state.rs#L295
    const market = await connection.getAccountInfo(marketId);
    const marketInfo = Buffer.from(market.data);

    let offset = 0;
    if (marketInfo.subarray(offset, offset += 5).toString('ascii') !== "serum") {
        console.log('Invalid market account, expected serum...');
        throw new Error('Invalid market account, expected serum...');
    }

    offset += 8; // flags
    offset += 32; // own address

    const vault_signer_nonce = marketInfo.subarray(offset, offset += 8).readBigUInt64LE();

    const coin_mint = new PublicKey(marketInfo.subarray(offset, offset += 32));
    const pc_mint = new PublicKey(marketInfo.subarray(offset, offset += 32));

    const coin_vault = new PublicKey(marketInfo.subarray(offset, offset += 32));

    offset += 8; // coin deposits total
    offset += 8; // coin fees accured

    const pc_vault = new PublicKey(marketInfo.subarray(offset, offset += 32));

    offset += 8; // pc deposits total
    offset += 8; // pc fees accured

    offset += 8; // pc dust threshold

    const request_queue = new PublicKey(marketInfo.subarray(offset, offset += 32));
    const event_queue = new PublicKey(marketInfo.subarray(offset, offset += 32));
    const bids = new PublicKey(marketInfo.subarray(offset, offset += 32));
    const asks = new PublicKey(marketInfo.subarray(offset, offset += 32));

    offset += 8; // coin lot size
    offset += 8; // pc lot size
    offset += 8; // fee rate bps
    offset += 8; // referrer rebates accured

    return {
        marketAccAddress: marketId,
        eventsAddress: event_queue,
        requestsAddress: request_queue,
        bidsAddress: bids,
        asksAddress: asks,
        serumPDA: PublicKey.createProgramAddressSync([marketId.toBuffer(), new BN.BN(vault_signer_nonce).toArrayLike(Buffer, "le", 8)], OPENBOOK_PROGRAM_ID),
        baseATA: coin_vault,
        quoteATA: pc_vault,
        baseMint: coin_mint,
        quoteMint: pc_mint,
    }
}

function computeRaydiumAddresses(openBookMarketAccAddress) {
    const raydiumSeed = suffix => PublicKey.findProgramAddressSync([
        RAYDIUM_PROGRAM_ID.toBuffer(),
        openBookMarketAccAddress.toBuffer(),
        suffix
    ], RAYDIUM_PROGRAM_ID)[0];
    return {
        ammId: raydiumSeed("amm_associated_seed"),
        poolCoinAccount: raydiumSeed("coin_vault_associated_seed"),
        poolQuoteAccount: raydiumSeed("pc_vault_associated_seed"),
        lpMint: raydiumSeed("lp_mint_associated_seed"),
        targetOrdersAccount: raydiumSeed("target_associated_seed"),
        ammOpenOrders: raydiumSeed("open_order_associated_seed"),
    };
}

async function getPrice(mint) {
    while (true) {
        try {
            let url = `https://price.jup.ag/v6/price?ids=${mint}&vsToken=So11111111111111111111111111111111111111112`
            const headers = {
                'Content-Type': 'application/json',
            };
            const requestOptions = {
                method: 'GET',
                headers: headers
            };
            
            const response = await fetch(url, requestOptions);
            
            if (!response.ok) {
                console.log(`HTTP error! Status: ${response.status}`);
                return 0
            }
            
            const data = await response.json();
            let item = data["data"][mint]["price"];
            let price = parseFloat(item);

            return price
        } catch (error) {
            console.log(error);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

async function calcSlippageBuffer(slippage, mint, amount) {
    slippage = parseFloat((slippage / 100).toFixed(2));
    reverceSlippage = 1.00 - slippage
    let price = await getPrice(mint);
    let SAmount = amount * price
    let am = parseInt(`${SAmount * reverceSlippage}`)
    const minReceivedBuffer = Buffer.alloc(8);
    minReceivedBuffer.writeBigUInt64LE(BigInt(am));
    return minReceivedBuffer
}

async function buy(key, rpc, mint1, mint2, amount, gas, slippage) {
    const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(key)));

    let connection = new Connection(rpc, 'processed');

    let in_t = new PublicKey(mint1)
    let token = new PublicKey(mint2)

    let result = await connection.getProgramAccounts(RAYDIUM_PROGRAM_ID, {
        filters: [
            {
                dataSize: 752,
            },
            {
                memcmp: {
                offset: 400,
                bytes: token.toBase58(),
                },
            },
            {
                memcmp: {
                offset: 432,
                bytes: in_t.toBase58(),
                },
            },
        ],
    });
    if (result.length !== 1) {
        const result1 = await connection.getProgramAccounts(RAYDIUM_PROGRAM_ID, {
            filters: [
                {
                    dataSize: 752,
                },
                {
                    memcmp: {
                    offset: 400,
                    bytes: in_t.toBase58(),
                    },
                },
                {
                    memcmp: {
                    offset: 432,
                    bytes: token.toBase58(),
                    },
                },
            ],
        });
        if (result1.length !== 1) {
            throw new Error("OpenBook market not found or not unique");
        } else {
            result = result1
        }
    }
    const marketId = new PublicKey(
        result[0].account.data.slice(
        400 + 32 + 32 + 32 + 32,
        400 + 32 + 32 + 32 + 32 + 32,
        ),
    );
    const openBookAddresses = await loadOpenBookAddresses(marketId, connection);
    const raydiumAddresses = computeRaydiumAddresses(marketId);

    let desAmount = Math.floor(Number(amount) * 1_000_000_000);

    const solToSpendBuffer = Buffer.alloc(8);
    solToSpendBuffer.writeBigUInt64LE(BigInt(desAmount));

    const instructions = [ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: Number(gas) * 1_000_000_000,
    })];

    const userWsolATA = await splToken.getAssociatedTokenAddress(in_t, payer.publicKey);
    const userTokenATA = await splToken.getAssociatedTokenAddress(token, payer.publicKey);

    const WsolCreateATAInstruction = splToken.createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        userWsolATA,
        payer.publicKey,
        in_t
    );
    instructions.push(WsolCreateATAInstruction);

    const createTokenAccountIx = splToken.createAssociatedTokenAccountIdempotentInstruction(
        payer.publicKey,
        userTokenATA,
        payer.publicKey,
        token
    );
    instructions.push(createTokenAccountIx);

    const transferInstruction = SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: userWsolATA,
        lamports: desAmount,
    });
    instructions.push(transferInstruction);
    
    const syncInstruction = splToken.createSyncNativeInstruction(
        userWsolATA,
        splToken.TOKEN_PROGRAM_ID
    );
    instructions.push(syncInstruction);

    let minReceivedBuffer = await calcSlippageBuffer(slippage, mint2, desAmount);

    const buyIxReal = new TransactionInstruction({
        programId: RAYDIUM_PROGRAM_ID,
        data: Buffer.concat([
            Buffer.from("09", "hex"),
            solToSpendBuffer,
            Buffer.from("0000000000000000", "hex"),
            minReceivedBuffer
        ]),
        keys: [
            { pubkey: splToken.TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: raydiumAddresses.ammId, isSigner: false, isWritable: true },
            { pubkey: RAYDIUM_PDA, isSigner: false, isWritable: false },
            { pubkey: raydiumAddresses.ammOpenOrders, isSigner: false, isWritable: true },
            { pubkey: raydiumAddresses.targetOrdersAccount, isSigner: false, isWritable: true },
            { pubkey: raydiumAddresses.poolCoinAccount, isSigner: false, isWritable: true },
            { pubkey: raydiumAddresses.poolQuoteAccount, isSigner: false, isWritable: true },
            { pubkey: OPENBOOK_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: openBookAddresses.marketAccAddress, isSigner: false, isWritable: true },
            { pubkey: openBookAddresses.bidsAddress, isSigner: false, isWritable: true },
            { pubkey: openBookAddresses.asksAddress, isSigner: false, isWritable: true },
            { pubkey: openBookAddresses.eventsAddress, isSigner: false, isWritable: true },
            { pubkey: openBookAddresses.baseATA, isSigner: false, isWritable: true },
            { pubkey: openBookAddresses.quoteATA, isSigner: false, isWritable: true },
            { pubkey: RAYDIUM_MARKET_VAULT_SIGNER, isSigner: false, isWritable: false },
            { pubkey: userWsolATA, isSigner: false, isWritable: true },
            { pubkey: userTokenATA, isSigner: false, isWritable: true },
            { pubkey: payer.publicKey, isSigner: true, isWritable: false },
        ]
    });
    instructions.push(buyIxReal);

    // const jitoTransfer = SystemProgram.transfer({
    //     fromPubkey: payer.publicKey,
    //     toPubkey: new PublicKey(JITO_TIP),
    //     lamports: 100000,
    // });
    // instructions.push(jitoTransfer);

    const message = new TransactionMessage({
        payerKey: payer.publicKey,
        recentBlockhash: (await connection.getLatestBlockhash('finalized')).blockhash,
        instructions,
    }).compileToV0Message();

    const tx = new VersionedTransaction(message);
    tx.sign([payer]);

    // await jitoSendTx(tx);

    const signature = await connection.sendTransaction(tx);
    await connection.confirmTransaction({ signature }, 'processed');
    console.log('Buy TX sent:', signature);

    return signature
}

// const args = process.argv.slice(2);
// const key = args[0];
// const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(key)));
// const inMint = "So11111111111111111111111111111111111111112";
// const outMint = args[1];
// const amount = args[2];
// const slippage = (100 - Number(args[3])) / 100;
// const rpc = args[4];
// const gas = args[5];

// await buy(payer, rpc, inMint, outMint, amount, gas, slippage);

module.exports = {
    buy
}