import * as flow from "./flow";

/** A single-producer, single-consumer, fixed power-of-2 capacity queue implementation. */
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
        this.mProducerIndex = 0;
        this.mConsumerIndex = 0;
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

/** A single-producer, single-consumer, growing power-of-2 capacity queue implementation. */
export class SpscLinkedArrayQueue<T> implements flow.Queue<T> {
    private mMask: number;
    private mProducerIndex: number;
    private mProducerArray: Array<any>;
    private mConsumerIndex: number;
    private mConsumerArray: Array<any>;

    static NEXT = new Object();    
    
    constructor(capacity: number) {
        if ((capacity & (capacity - 1)) != 0) {
            throw new Error("capacity must be power-of-2");
        }
        if (capacity < 2) {
            capacity = 2;
        }
        this.mMask = capacity - 1;
        const a = new Array<any>(capacity + 1);
        this.mProducerArray = a;
        this.mProducerIndex = 0;
        this.mConsumerArray = a;
        this.mConsumerIndex = 0;
    }
    
    offer(t: T) : boolean {
        if (t == null) {
            throw new Error("t is null");
        }
        const a = this.mProducerArray;
        const m = this.mMask;
        const pi = this.mProducerIndex;
        const o1 = (pi + 1) & m;
        const o = (pi + 1) & m;
        
        if (a[o1] != null) {
            const b = new Array<any>(m + 2);
            b[o] = t;
            a[m + 1] = b;
            this.mProducerArray = b;
            a[o] = SpscLinkedArrayQueue.NEXT;
            this.mProducerIndex = pi + 1;
        } else {
            a[o] = t;
            this.mProducerIndex = pi + 1;
        }
        return true;
    }
    
    poll() : T {
        const a = this.mConsumerArray;
        const m = this.mMask;
        const ci = this.mConsumerIndex;
        const o = ci & m;
        
        var v = a[o];
        if (v != null) {
            if (v == SpscLinkedArrayQueue.NEXT) {
                const b : Array<any> = a[m + 1];
                a[m + 1] = null;
                this.mConsumerArray = b;
                v = b[o];
                b[o] = null;                
            } else {
                a[o] = null;
            }
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