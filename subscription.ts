import * as rs from './reactivestreams-spec';
import * as flow from './flow';

export class SH {
    static validRequest(n: number) : boolean {
        if (n <= 0) {
            throw new Error("n > 0 required but it was " + n);
        }
        return true;
    }
    
    static validSubscription(current: rs.Subscription, s: rs.Subscription) : boolean {
        if (s == null) {
            throw new Error("s is null");
        }
        if (current != null) {
            s.cancel();
            throw new Error("Subscription already set!");
        }
        return true;
    }
}

export class EmptySubscription implements flow.QueueSubscription<any> {
    request(n: number) : void {
        // deliberately ignored
    }
    
    cancel() : void {
        // deliberately ignored
    }
    
    requestFusion(mode : number) : number {
        return flow.FC.NONE;
    }
    
    offer(t: any) : boolean {
        throw new Error("Unsupported in Fusion mode");
    }
    
    poll() : any {
        return null;
    }
    
    isEmpty() : boolean {
        return true;
    }
    
    size() : number {
        return 0;
    }
    
    clear() : void {
        // no op
    }
    
    static complete(s : rs.Subscriber<any>) : void {
        s.onSubscribe(EmptySubscription.INSTANCE);
        s.onComplete();
    }
    
    static error(s : rs.Subscriber<any>, e : Error) : void {
        s.onSubscribe(EmptySubscription.INSTANCE);
        s.onError(e);
    }
    
    public static INSTANCE : rs.Subscription = new EmptySubscription();
}

export class ScalarSubscription<T> implements flow.QueueSubscription<T> {
    private mActual : rs.Subscriber<T>;
    private mValue : T;
    private once : boolean;
    
    constructor(value: T, actual: rs.Subscriber<T>) {
        this.mValue = value;
        this.mActual = actual;
    }
    
    request(n : number) {
        if (SH.validRequest(n)) {
            if (!this.once) {
                this.once = true;
                
                this.mActual.onNext(this.mValue);
                this.mActual.onComplete();
            }
        }
    }
    
    cancel() {
        this.once = true;
    }
    
    offer(t: T) : boolean {
        throw flow.FC.unsupported();
    }
    
    poll() : T {
        if (!this.once) {
            this.once = true;
            return this.mValue;
        }
        return null;
    }
    
    isEmpty() : boolean {
        return this.once;
    }
    
    clear() {
        this.once = true;
    }
    
    size() : number {
        return this.once ? 0 : 1;
    }
    
    requestFusion(mode: number) : number {
        if ((mode & flow.FC.SYNC) != 0) {
            return flow.FC.SYNC;
        }
        return flow.FC.NONE;
    }
}