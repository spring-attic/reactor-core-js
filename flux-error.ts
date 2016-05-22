import * as rs from './reactivestreams-spec';
import * as sp from './subscription';

export class OnErrorReturnSubscriber<T> implements rs.Subscriber<T>, rs.Subscription {
    
    private done: boolean;
    private requested: number;
    private s: rs.Subscription;
    
    constructor(private actual: rs.Subscriber<T>, private value: T) {
        this.requested = 0;
        this.done = false;
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            this.actual.onSubscribe(this);
        }
    }
    
    onNext(t: T) : void {
        const p = this.requested;
        if (p != Infinity) {
            this.requested = p - 1;
        }
        this.actual.onNext(t);
    }
    
    onError(t: Error) : void {
        if (this.requested != 0) {
            this.actual.onNext(this.value);
            this.actual.onComplete();
        } else {
            this.done = true;
        }
    }
    
    onComplete() : void {
        this.actual.onComplete();
    }
    
    request(n: number) : void {
        if (sp.SH.validRequest(n)) {
            if (this.done) {
                if (this.requested == 0) {
                    this.requested = 1;
                    this.actual.onNext(this.value);
                    this.actual.onComplete();
                }
            } else {
                this.requested += n;
                this.s.request(n);
            }
        }
    }
    
    cancel() : void {
        this.s.cancel();
    }
}

export class OnErrorResumeSubscriber<T> implements rs.Subscriber<T>, rs.Subscription {
    private done: boolean;
    private requested: number;
    private s: rs.Subscription;
    
    constructor(private actual: rs.Subscriber<T>, private errorMapper: (t: Error) => rs.Publisher<T>) {
        this.done = true;
        this.requested = 0;
        this.s = null;
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            this.actual.onSubscribe(this);
        }
    }
    
    onNext(t: T) : void {
        const p = this.requested;
        if (p != Infinity) {
            this.requested = p - 1;
        }
        this.actual.onNext(t);
    }
    
    onError(t: Error) : void {
        var p : rs.Publisher<T>;
        
        try {        
            p = this.errorMapper(t);
        } catch (ex) {
            this.actual.onError(ex);
            return;
        }
        
        if (p == null) {
            this.actual.onError(new Error("The errorMapper returned a null publisher"));
            return;
        }
        
        if (this.s != sp.SH.CANCELLED) {
            this.s = null;
            
            p.subscribe(new OnErrorResumeSecondSubscriber<T>(this, this.actual));
        }
    }
    
    onComplete() : void {
        this.actual.onComplete();
    }
    
    request(n: number) : void {
        if (sp.SH.validRequest(n)) {
            this.requested += n;
            this.s.request(n);
        }
    }
    
    cancel() : void {
        this.s.cancel();
    }
    
    currentRequested() : number {
        return this.requested;
    }
}

class OnErrorResumeSecondSubscriber<T> implements rs.Subscriber<T> {
    constructor(private parent: OnErrorResumeSubscriber<T>, private actual: rs.Subscriber<T>) {
            
    }
    
    onSubscribe(s: rs.Subscription) : void {
        this.parent.onSubscribe(s);
        s.request(this.parent.currentRequested());
    }
    
    onNext(t: T): void {
        this.actual.onNext(t);        
    }
    
    onError(t: Error) : void {
        this.actual.onError(t);
    }
    
    onComplete() : void {
        this.actual.onComplete();
    }
}