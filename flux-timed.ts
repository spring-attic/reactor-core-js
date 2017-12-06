import * as rs from './reactivestreams-spec';
import * as flow from './flow';
import * as sp from './subscription';

export class TimedSubscription implements rs.Subscription {
    
    private mFuture: flow.Cancellation;
    
    private mRequested : boolean;
    
    constructor(private actual: rs.Subscriber<number>) {
        this.mFuture = null;
        this.mRequested = false;
    }
    
    request(n: number) : void {
        if (sp.SH.validRequest(n)) {
            this.mRequested = true;
        }
    }
    
    cancel() : void {
        var a = this.mFuture;
        if (a != flow.CancelledCancellation.INSTANCE) {
            this.mFuture = flow.CancelledCancellation.INSTANCE;
            if (a != null) {
                a.dispose();
            }
        }
    }
    
    public run = () : void => {
        if (this.mRequested) {
            this.actual.onNext(0);
            if (this.mFuture != flow.CancelledCancellation.INSTANCE) {
                this.actual.onComplete();
            }
        } else {
            this.actual.onError(new Error("Could not emit the timed value due to lack of requests"));
        }
    }
    
    setFuture(c: flow.Cancellation) : void {
        var a = this.mFuture;
        if (a != flow.CancelledCancellation.INSTANCE) {
            this.mFuture = c;
        } else {
            c.dispose();
        }
    }
}

export class PeriodicTimedSubscription implements rs.Subscription {
    
    private mFuture: flow.Cancellation;
    
    private mRequested : number;
    
    private mCount: number;
    
    constructor(private actual: rs.Subscriber<number>) {
        this.mFuture = null;
        this.mRequested = 0;
        this.mCount = 0;
    }
    
    request(n: number) : void {
        if (sp.SH.validRequest(n)) {
            this.mRequested += n;
        }
    }
    
    cancel() : void {
        var a = this.mFuture;
        if (a != flow.CancelledCancellation.INSTANCE) {
            this.mFuture = flow.CancelledCancellation.INSTANCE;
            if (a != null) {
                a.dispose();
            }
        }
    }
    
    public run = () : void => {
        if (this.mRequested-- > 0) {
            this.actual.onNext(this.mCount++);
            if (this.mFuture != flow.CancelledCancellation.INSTANCE) {
                this.actual.onComplete();
            }
        } else {
            this.cancel();
            this.actual.onError(new Error("Could not emit the timed value due to lack of requests"));
        }
    }
    
    setFuture(c: flow.Cancellation) : void {
        var a = this.mFuture;
        if (a != flow.CancelledCancellation.INSTANCE) {
            this.mFuture = c;
        } else {
            c.dispose();
        }
    }
}

/** Represents a tuple of a value and a time value (timestamp or time interval). */
export class Timed<T> {
    
    private mValue : T;
    private mTime : number;
    
    public get value() { return this.mValue; }
    
    public get time() { return this.mTime; }
    
    constructor(value: T, time: number) {
        this.mValue = value;
        this.mTime = time;
    }
}
