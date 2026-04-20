// src/types/momo-escrow-sdk.d.ts
declare module 'momo-escrow-sdk' {
  export class MomoSDK {
    constructor(config: any);
    initiatePayment(params: any): Promise<any>;
    verifyReceipt(receipt: any): Promise<boolean>;
  }
  
  // Export other classes and types as needed
  export class EscrowEngine {
    constructor(config: any);
    initiatePayment(params: any): Promise<any>;
  }
}