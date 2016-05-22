import * as rs from './reactivestreams-spec';
import * as sp from './subscription';

export class DoOnLifecycle<T> implements rs.Subscriber<T>, rs.Subscription {

    private s: rs.Subscription;

    private done: boolean;

    constructor(private actual: rs.Subscriber<T>,
            private mOnSubscribe: (s: rs.Subscription) => void,
            private mOnNext: (t: T) => void,
            private mOnAfterNext: (t: T) => void,
            private mOnError: (t: Error) => void,
            private mOnComplete: () => void,
            private mOnAfterTerminate: () => void,
            private mOnRequest: (n: number) => void,
            private mOnCancel: () => void
    ) {
        this.done = false;
        this.s = null;
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            try {
                this.mOnSubscribe(s);
            } catch (ex) {
                this.done = true;
                s.cancel();
                sp.EmptySubscription.error(this.actual, ex);
                return;
            }
            
            this.actual.onSubscribe(this);
        }
    }
    
    onNext(t: T) : void {
        if (this.done) {
            return;
        }
        try {
            this.mOnNext(t);
        } catch (ex) {
            this.cancel();
            this.onError(ex);
            return;
        }
        
        this.actual.onNext(t);
        
        try {
            this.mOnAfterNext(t);
        } catch (ex) {
            this.cancel();
            this.onError(ex);
            return;
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
            t = new Error(t + "\n" + ex);
        }
        
        this.actual.onError(t);
        
        try {
            this.mOnAfterTerminate();
        } catch (ex) {
            console.log(ex);
        }
    }
    
    onComplete() : void {
        if (this.done) {
            return;
        }
        this.done = true;

        var c = false;
        try {
            this.mOnComplete();
            c = true;
        } catch (ex) {
            this.actual.onError(ex);
        }
        
        if (c) {
            this.onComplete();
        }
        
        try {
            this.mOnAfterTerminate();
        } catch (ex) {
            console.log(ex);
        }
    }
    
    request(n: number) : void {
        try {
            this.mOnRequest(n);
        } catch (ex) {
            console.log(ex);
        }
        this.s.request(n);
    }
    
    cancel() : void {
        try {
            this.mOnCancel();
        } catch (ex) {
            console.log(ex);
        }
        this.s.cancel();
    }
}