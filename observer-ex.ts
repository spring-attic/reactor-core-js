import { Observer } from './observable-spec';
import { Cancellation, CancelledCancellation } from './flow';

export class CallbackObserver<T> implements Observer<T>, Cancellation {
    private mOnNext : (t: T) => void;
    private mOnError : (t: Error) => void;
    private mOnComplete : () => void;
    
    private done : boolean;
    private s : Cancellation;
    
    constructor(onNext : (t: T) => void, onError : (t: Error) => void, onComplete : () => void) {
        this.mOnNext = onNext;
        this.mOnError = onError;
        this.mOnComplete = onComplete;
    }
    
    onSubscribe(s: Cancellation) : void {
        if (this.s != null) {
            s.dispose();
            if (this.s != CancelledCancellation.INSTANCE) {
                throw new Error("Subscription already set");
            }
            return;
        }
        this.s = s;
    }
    
    onNext(t: T) : void {
        if (this.done) {
            return;
        }
        try {
            this.mOnNext(t);
        } catch (ex) {
            this.s.dispose();
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
        this.s = CancelledCancellation.INSTANCE;
        if (a != null && a != CancelledCancellation.INSTANCE) {
            a.dispose();
        }
    }
}