import { Injectable } from '@angular/core';
import {
    rpc,
    sc,
    tx,
    u,
    wallet as wallet3,
} from '@cityofzion/neon-core-neo3/lib';
import { SignerLike, Transaction, Witness } from '@cityofzion/neon-core-neo3/lib/tx';
import { Observable, from, throwError } from 'rxjs';
import {
    AssetState,
    NotificationService,
    GlobalService,
    NeonService,
    UtilServiceState,
} from '@app/core';
import BigNumber from 'bignumber.js';
import { ContractCall, ContractParam } from '@cityofzion/neon-core-neo3/lib/sc';
import { Asset } from '@/models/models';
import { GAS3_CONTRACT } from '../_lib';

interface CreateNeo3TxInput {
    invokeArgs: ContractCall[];
    signers: SignerLike[];
    networkFee: string;
    systemFee?: any;
    overrideSystemFee?: any,
}

@Injectable()
export class Neo3InvokeService {
    rpcClient;
    constructor(
        public assetState: AssetState,
        public notification: NotificationService,
        private globalService: GlobalService,
        private neon: NeonService,
        private util: UtilServiceState
    ) {
        this.rpcClient = new rpc.RPCClient(this.globalService.n3Network.rpcUrl);
    }
    createNeo3Tx(params: CreateNeo3TxInput): Observable<Transaction> {
        const neo3This = this;
        const rpcClientTemp = this.rpcClient;
        const signerJson = params.signers.map((signerItem) => {
            return {
                account: signerItem.account,
                scopes: signerItem.scopes,
                allowedcontracts:
                    signerItem?.allowedContracts?.map((item) =>
                        item.toString()
                    ) || [],
                allowedgroups:
                    signerItem?.allowedGroups?.map((item) => item.toString()) ||
                    [],
            };
        });
        const vars: any = {};
        let script: string = '';
        try {
            script = sc.createScript(...params.invokeArgs);
        } catch (error) {
            return throwError({
                type: 'scriptError',
                error,
            });
        }

        /**
         * We will perform the following checks:
         * 1. The token exists. This can be done by performing a invokeFunction call.
         * 2. The amount of token exists on fromAccount.
         * 3. The amount of GAS for fees exists on fromAccount.
         * All these checks can be performed through RPC calls to a NEO node.
         */

        async function createTransaction() {
            // We retrieve the current block height as we need to
            const currentHeight = await rpcClientTemp.getBlockCount();
            vars.tx = new tx.Transaction({
                signers: params.signers,
                validUntilBlock: currentHeight + 30,
                systemFee: vars.systemFee,
                script,
            });

            console.log('\u001b[32m  ✓ Transaction created \u001b[0m');
        }

        /**
         * Network fees pay for the processing and storage of the transaction in the
         * network. There is a cost incurred per byte of the transaction (without the
         * signatures) and also the cost of running the verification of signatures.
         */
        async function checkNetworkFee() {
            const networkFeeEstimate = await neo3This.calculateNetworkFee(vars.tx);

            vars.tx.networkFee = u.Fixed8.fromRawNumber(
                networkFeeEstimate.toString()
            ).add(new BigNumber(params.networkFee || 0).toFixed());

            console.log(
                `\u001b[32m  ✓ Network Fee set: ${vars.tx.networkFee} \u001b[0m`
            );
        }

        /**
         * SystemFees pay for the processing of the script carried in the transaction. We
         * can easily get this number by using invokeScript with the appropriate signers.
         */
        async function checkSystemFee() {
            if (params.overrideSystemFee) {
                vars.tx.systemFee = u.Fixed8.fromRawNumber(new BigNumber(params.overrideSystemFee).shiftedBy(8).toFixed(0));
                return;
            }
            const invokeFunctionResponse = await neo3This.util.n3InvokeScript(
                u.HexString.fromHex(script).toBase64(),
                signerJson
            );
            if (invokeFunctionResponse.state !== 'HALT') {
                throw {
                    type: 'rpcError',
                    error: invokeFunctionResponse,
                };
            }
            const requiredSystemFee = u.Fixed8.fromRawNumber(
                new BigNumber(invokeFunctionResponse.gasconsumed).times(1.01).toFixed(0)
            );
            vars.tx.systemFee = requiredSystemFee.add(
                new BigNumber(params.systemFee || 0).toFixed()
            );
            console.log(
                `\u001b[32m  ✓ SystemFee set: ${vars.tx.systemFee.toString()}\u001b[0m`
            );
        }

        return from(
            createTransaction()
                .then(checkSystemFee)
                .then(checkNetworkFee)
                .then(() => {
                    return vars.tx;
                })
        );
    }

    async sendNeo3Tx(baseTx1: string): Promise<any> {
        const result = await this.rpcClient.sendRawTransaction(baseTx1);

        console.log('\n\n--- Transaction hash ---');
        return result;
    }

    public async getFeeInformation(client) {
        const policyScript = new sc.ScriptBuilder()
            .emitContractCall(sc.PolicyContract.INSTANCE.getFeePerByte())
            .emitContractCall(sc.PolicyContract.INSTANCE.getExecFeeFactor())
            .build();
        const res = await client.invokeScript(
            u.HexString.fromHex(policyScript)
        );
        const [feePerByte, executionFeeFactor] = res.stack.map((s) =>
            u.BigInteger.fromNumber(s.value)
        );
        return { feePerByte, executionFeeFactor };
    }

    async calculateNetworkFee(txn) {
        let txClone = txn.export();
        txClone.systemFee = new BigNumber(txn.systemFee).shiftedBy(8).toFixed(0) as any;
        txClone = new tx.Transaction(txClone);
        const wif =
            this.neon.WIFArr[
                this.neon.walletArr.findIndex(
                    (item) =>
                        item.accounts[0].address ===
                        this.neon.wallet.accounts[0].address
                )
            ] || 'KyEUreM7QVQvzUMeGSBTKVtQahKumHyWG6Dj331Vqg5ZWJ8EoaC1';
        txClone.sign(wif, this.globalService.n3Network.magicNumber);
        if (txn.signers.length === 2) {
            txClone.witnesses.unshift(new Witness({verificationScript: '', invocationScript: ''}))
        }
        const fee = await this.rpcClient.calculateNetworkFee(txClone);
        return fee;
    }

    public hexToBase64(str: string) {
        return Buffer.from(str, 'hex').toString('base64');
    }

    public createInvokeInputs(data) {
        const { args, scriptHash, operation } = data;
        return {
            scriptHash,
            operation,
            args: args.map((item) => {
                if (item && item.type && item.type === 'Address') {
                    return sc.ContractParam.hash160(item.value.toString());
                } else if (item) {
                    return ContractParam.fromJson(item);
                } else {
                    return null;
                }
            }),
        };
    }
    async isEnoughFee(
        fromAddress: string,
        systemFee,
        networkFee
    ): Promise<boolean> {
        const balanceResponse = await this.assetState
            .getAddressBalances(fromAddress, 'Neo3');
        const gasAsset: Asset = balanceResponse.find(
            (item) => item.asset_id === GAS3_CONTRACT
        );
        const gasAmount = gasAsset ? gasAsset.balance : 0;
        const requireGasAmount = new BigNumber(systemFee.toString()).plus(
            new BigNumber(networkFee.toString())
        );
        if (requireGasAmount.comparedTo(new BigNumber(gasAmount)) > 0) {
            return false;
        }
        return true;
    }
}
