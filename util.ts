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
        const a = new Array<T>(capacity);
        a.fill(null);
        this.mArray = a;
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
        a.fill(null);
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
        const o = pi & m;
        
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

/** A fixed size buffer that overwrites old entries. */
export class RingBuffer<T> {
    private array: Array<T>;
    private producerIndex: number = 0;
    private consumerIndex: number = 0;
    
    constructor(capacity: number) {
        this.array = new Array<T>(capacity);
        this.array.fill(null);
    }    
    
    offer(t: T) : void {
        const a = this.array;
        
        var pi = this.producerIndex;
        a[pi++] = t;
        
        if (pi == a.length) {
            this.producerIndex = 0;
        } else {
            this.producerIndex = pi;
        }
        var ci = this.consumerIndex;
        if (pi == ci) {
            ci++;
            if (ci == a.length) {
                this.consumerIndex = 0;
            } else {
                this.consumerIndex = ci;
            }
        }
    }
    
    poll() : T {
        const a = this.array;
        var ci = this.consumerIndex;
        
        const v = a[ci];
        if (v != null) {
            a[ci] = null;
            ci++;
            if (ci == a.length) {
                this.consumerIndex = 0;
            } else {
                this.consumerIndex = ci;
            }
        }
        return v;
    }
    
    isEmpty() : boolean {
        return this.array[this.consumerIndex] == null;
    }
    
    clear() : void {
        this.array.fill(null);
        this.consumerIndex = 0;
        this.producerIndex = 0;
    }
    
    size() : number {
        if (this.isEmpty()) {
            return 0;
        }
        const pi = this.producerIndex;
        const ci = this.consumerIndex;
        if (ci == pi) {
            return this.array.length;
        } else
        if (pi > ci) {
            return pi - ci;
        }
        return this.array.length - ci + pi;
    }
    
    isFull() : boolean {
        const pi = this.producerIndex;
        const ci = this.consumerIndex;
        if (ci == pi) {
            return this.array[ci] != null;
        }
        return false;
    }
}