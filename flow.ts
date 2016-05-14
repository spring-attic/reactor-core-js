import * as rs from './reactivestreams-spec';

export interface Cancellation {
    dispose() : void;
}

export class FC {
    public static get NONE() : number { return 0; }
    public static get SYNC() : number { return 1; }
    public static get ASYNC() : number { return 2; }
    public static get ANY() : number { return 3; }
    public static get BOUNDARY() : number { return 7; }
    
    public static unsupported() : Error {
        return new Error("Unsupported in Fusion mode");
    }
}

export interface Fuseable {
    // TypeScript has no instanceof, existence of this method is considered to be Fuseable
    isFuseable() : void;
}

export interface Queue<T> {
    offer(t: T) : boolean;
    poll() : T;
    isEmpty() : boolean;
    clear() : void;
    size() : number;
}

export interface QueueSubscription<T> extends rs.Subscription, Queue<T> {
    requestFusion(mode: number) : number;
}

export interface ConditionalSubscriber<T> extends rs.Subscriber<T> {
    tryOnNext(t: T) : boolean;
}

export interface Callable<T> {
    call() : T;
}

export interface ScalarCallable<T> extends Callable<T> {
    // TypeScript has no instanceof, existence of this method is considered to be ScalarCallable
    isScalar() : void;
}

export class CallbackCancellation implements Cancellation {
    private mCallback: () => void;
    
    constructor(callback: () => void) {
        this.mCallback = callback;
    }
    
    dispose() : void {
        const c = this.mCallback;
        if (c != null) {
            this.mCallback = null;
            c();
        }
    }
}

export class Cancellations {
    private static REJECTED_INSTANCE = new CallbackCancellation(() => { });
    static get REJECTED() : Cancellation { return Cancellations.REJECTED_INSTANCE; }
}

export class CancelledCancellation implements Cancellation {
    private static INSTANCE_0 = new CancelledCancellation();
    static get INSTANCE() : Cancellation { return CancelledCancellation.INSTANCE_0; }

    dispose() : void {
        
    }
}

export class BooleanCancellation implements Cancellation {
    private mCancelled: boolean;
    
    dispose() : void {
        this.mCancelled = true;
    }
    
    isCancelled() : boolean {
        return this.mCancelled;
    }
}

export class ActionCancellation implements Cancellation {
    private mCancelled: boolean;
    
    constructor(private mAction: () => void) {
        
    }
    
    dispose() : void {
        if (!this.mCancelled) {
            this.mCancelled = true;
            var a = this.mAction;
            this.mAction = null;
            
            a();        
        }
    }
    
    isCancelled() : boolean {
        return this.mCancelled;
    }
}