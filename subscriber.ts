import * as rs from './reactivestreams-spec';
import * as ds from './flow';
import * as sp from './subscription';

export class CallbackSubscriber<T> implements rs.Subscriber<T>, ds.Cancellation {
    private mOnNext : (t: T) => void;
    private mOnError : (t: Error) => void;
    private mOnComplete : () => void;
    
    private done : boolean;
    private s : rs.Subscription;
    
    constructor(onNext : (t: T) => void, onError : (t: Error) => void, onComplete : () => void) {
        this.mOnNext = onNext;
        this.mOnError = onError;
        this.mOnComplete = onComplete;
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (this.s != null) {
            if (this.s != sp.EmptySubscription.INSTANCE) {
                throw new Error("Subscription already set");
            }
            s.cancel();
            return;
        }
        this.s = s;
        s.request(Infinity);
    }
    
    onNext(t: T) : void {
        if (this.done) {
            return;
        }
        try {
            this.mOnNext(t);
        } catch (ex) {
            this.s.cancel();
            this.onError(ex);
        }
    }
    
    onError(t: Error) : void {
        if (this.done) {
            console.log(t);
            return;
        }
        this.done = true;
        try {
            this.mOnError(t);
        } catch (ex) {
            console.log(t);
            console.log(ex);
        }
    }
    
    onComplete() : void {
        if (this.done) {
            return;
        }
        this.done = true;
        try {
            this.mOnComplete();
        } catch (ex) {
            console.log(ex);
        }
    }
    
    dispose() : void {
        const a = this.s;
        this.s = sp.EmptySubscription.INSTANCE;
        if (a != null && a != sp.EmptySubscription.INSTANCE) {
            a.cancel();
        }
    }
}

/** Provides convenient assertXXX checks on the received signal pattern. */
export class TestSubscriber<T> implements rs.Subscriber<T>, rs.Subscription {
    
    private requested: number;
    
    private s: rs.Subscription;
    
    private subscriptionChecked: boolean;
    
    private completions: number;
    
    private values: Array<T>;
    
    private errors: Array<Error>;
    
    constructor(initialRequest?: number) {
        if (initialRequest === undefined) {
            this.requested = 0;
        } else {
            this.requested = initialRequest;
        }
        this.s = null;
        this.subscriptionChecked = false;
        this.completions = 0;
        this.values = new Array<T>();
        this.errors = new Array<Error>();
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (this.s != null) {
            if (this.s == sp.SH.CANCELLED) {
                s.cancel();
                return;
            }
            this.errors.push(new Error("Subscription already set"));
            s.cancel();
        } else {
            this.s = s;
            const r = this.requested;
            if (r != 0) {
                this.requested = 0;
                s.request(r);
            }
        }
    }
    
    onNext(t: T) : void {
        if (!this.subscriptionChecked) {
            this.subscriptionChecked = true;
            if (this.s == null) {
                this.errors.push(new Error("onSubscribe not called before onNext"));
            }
        }
        this.values.push(t);
    }
    
    onError(t: Error) : void {
        if (!this.subscriptionChecked) {
            this.subscriptionChecked = true;
            if (this.s == null) {
                this.errors.push(new Error("onSubscribe not called before onError"));
            }
        }
        this.errors.push(t);
    }
    
    onComplete() : void {
        if (!this.subscriptionChecked) {
            this.subscriptionChecked = true;
            if (this.s == null) {
                this.errors.push(new Error("onSubscribe not called before onComplete"));
            }
        }
        this.completions++;        
    }
    
    request(n: number) : void {
        if (n <= 0) {
            this.errors.push(new Error("n > 0 required but it was " + n));
        } else {
            if (this.s == null) {
                this.requested += n;
            } else {
                this.s.request(n);
            }
        }        
    }
    
    cancel() : void {
        const a = this.s;
        if (a != sp.SH.CANCELLED) {
            this.s = sp.SH.CANCELLED;
            if (a != null) {
                a.cancel();
            }
        }
    }
    
    private error(message: string) : void {
        var m = message
             + " (" + this.completions + " completions)"
             + " (" + this.errors.length + " errors)";
             
        for (var e of this.errors) {
            m += "\n";
            m += e;
        }
        
        throw new Error(m);
    }
    
    assertNoValues() : void {
        if (this.values.length != 0) {
            this.error("No values expected but " + this.values.length + " received:\n" + this.values + "\n");
        }
    }
    
    assertNoError() : void {
        if (this.errors.length != 0) {
            this.error("No errors expected");
        }
    }
    
    assertComplete() : void {
        if (this.completions == 0) {
            this.error("Completion expected");
        }
        if (this.completions > 1) {
            this.error("Single completion expected");
        }
    }
    
    assertNotComplete() : void {
        if (this.completions != 0) {
            this.error("No completion expected");
        }
    }
    
    assertError(messagePart: string) : void {
        if (this.errors.length != 1) {
            this.error("Single error expected");
        } else {
            if (this.errors[0].message.indexOf(messagePart) < 0) {
                this.error("Error message doesn't contain '" + messagePart + "'");
            }
        }
    }
    
    assertValue(v: T) : void {
        if (this.values.length == 0) {
            this.error("Expected: " + v + " but no values received");
        }
        if (this.values.length != 1) {
            this.error("Expected: " + v + " but " + this.values.length + " values received:\n" + this.values + "\n");
        }
    }
    
    assertValueCount(n: number) : void {
        if (this.values.length != n) {
            this.error("" + n + " values expected but " + this.values.length + " values received");
        }
    }
    
    assertValues(v: Array<T>) : void {
        if (this.values.length != v.length) {
            this.error("Number of values differ. Expected: [" + v.length + "] " + v + "; Actual: [" + this.values.length + "] " + this.values + "\n");
        }
        
        for (var i = 0; i < v.length; i++) {
            const o1 = v[i];
            const o2 = this.values[i];
            
            if (o1 != o2) {
                this.error("Values @ " + i + " differ. Expected: " + o1 + "; Actual: " + o2);
            }
        }
    }
    
    assertSubscribed() {
        if (this.s == null) {
            this.error("onSubscribe not called");
        }
    }
}
