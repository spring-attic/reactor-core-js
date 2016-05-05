import * as flow from "./flow";

export class SpscArrayQueue<T> implements flow.Queue<T> {
    private mMask : number;
    private mArray : Array<T>;
    private mProducerIndex : number;
    private mConsumerIndex : number;
    
    constructor(capacity : number) {
        if ((capacity & (capacity - 1)) != 0) {
            throw new Error("capacity must be power-of-2");
        }
        this.mMask = capacity - 1;
        this.mArray = new Array<T>(capacity);
    } 
    
    offer(t: T) : boolean {
        if (t == null) {
            throw new Error("t is null");
        }
        const a = this.mArray;
        const m = this.mMask;
        const pi = this.mProducerIndex;
        const o = pi & m;
        
        if (a[o] != null) {
            return false;
        }
        a[o] = t;
        this.mProducerIndex = pi + 1;
        return true;
    }
    
    poll() : T {
        const a = this.mArray;
        const m = this.mMask;
        const ci = this.mConsumerIndex;
        const o = ci & m;
        
        const v = a[o];
        if (v != null) {
            a[o] = null;
            this.mConsumerIndex = ci + 1;
        }
        return v;
    }
    
    isEmpty() : boolean {
        return this.mProducerIndex == this.mConsumerIndex;
    }
    
    size() : number {
        return this.mProducerIndex - this.mConsumerIndex;
    }
    
    clear() : void {
        while (this.poll() != null);
    }
}