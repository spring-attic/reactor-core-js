import * as rs from './reactivestreams-spec';
import * as ds from './flow';
import * as pxs from './subscription';

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
            if (this.s != pxs.EmptySubscription.INSTANCE) {
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
        this.s = pxs.EmptySubscription.INSTANCE;
        if (a != null && a != pxs.EmptySubscription.INSTANCE) {
            a.cancel();
        }
    }
}