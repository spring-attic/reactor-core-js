import * as rs from './reactivestreams-spec';
import * as sp from './subscription';
import * as flow from './flow';
import * as util from './util';

export class ConcatMapSubscriber<T, R> implements rs.Subscriber<T>, rs.Subscription {
    private mQueue: flow.Queue<T>;
    
    private s: rs.Subscription;
    
    private active: boolean;
    
    private done: boolean;
    
    private error: Error; 
    
    private inner : ConcatMapInnerSubscriber<T, R>;
    
    private cancelled: boolean;
    
    private wip: number;
    
    private consumed : number;
    private limit : number;
    
    constructor (
            private actual: rs.Subscriber<R>,
            private mapper: (t: T) => rs.Publisher<R>, 
            private delayError : boolean, 
            private prefetch: number) {
        this.mQueue = new util.SpscArrayQueue<T>(prefetch);
        this.s = null;
        this.active = false;
        this.done = false;
        this.error = null;
        this.cancelled = false;
        this.wip = 0;
        this.consumed = 0;
        this.limit = prefetch - (prefetch >> 2);
        this.inner = new ConcatMapInnerSubscriber<T, R>(this, actual);
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            this.actual.onSubscribe(this);
            
            s.request(this.prefetch);
        }
    }
    
    onNext(t: T) : void {
        if (!this.mQueue.offer(t)) {
            this.onError(new Error("ConcatMap queue is full?!"));
            return;
        }    
        this.drain();
    }
    
    onError(t: Error) : void {
        if (this.done && !this.addError(t)) {
            console.log(t);
            return;
        }
        this.done = true;
        this.drain();        
    }
    
    onComplete() : void {
        this.done = true;
        this.drain();
    }
    
    request(n : number) : void {
        this.inner.request(n);
    }
    
    cancel() : void {
        this.s.cancel();
        this.inner.cancel();    
    }
    
    innerError(t: Error) : void {
        if (this.addError(t)) {
            this.active = false;
            this.drain();
        } else {
            console.log(t);
        }
    }
    
    addError(t: Error) : boolean {
        var e = this.error;
            if (e != sp.SH.TERMINAL_ERROR) {
            if (e == null) {
                this.error = t;
            } else {
                this.error = new Error(e + "\n" + t);
            }
            return true;
        }
        return false;
    }
    
    innerComplete() : void {
        this.active = false;
        this.drain();
    }
    
    drain() : void {
        if (this.wip++ != 0) {
            return;
        }
        
        for (;;) {
            if (this.cancelled) {
                this.mQueue.clear();
                return;                
            }
            const err = this.error;
            if (err != null && !this.delayError) {
                this.cancel();
                this.mQueue.clear();
                this.error = sp.SH.TERMINAL_ERROR;
                this.actual.onError(err);
                return;
            }
            
            if (!this.active) {
                var v : T;
                
                v = this.mQueue.poll();
                
                const empty = v == null;
                
                if (this.done && empty) {
                    const ex = this.error;
                    if (ex != null) {
                        this.error = sp.SH.TERMINAL_ERROR;
                        this.actual.onError(ex);
                    } else {
                        this.actual.onComplete();
                    }
                    return;
                }
                
                if (!empty) {
                    
                    const c = this.consumed + 1;
                    if (c == this.limit) {
                        this.consumed = 0;
                        this.s.request(c);
                    } else {
                        this.consumed = c;
                    }
                    
                    var p : rs.Publisher<R>;
                    
                    try {
                        p = this.mapper(v);
                    } catch (e) {
                        this.addError(e);
                        continue;
                    }
                    
                    if (p == null) {
                        this.addError(new Error("The mapper returned a null Publisher"));
                        continue;
                    }
                    
                    /*
                    const call = (p as Object) as flow.Callable<R>;
                    
                    if (call.call) {
                        var u;
                        
                        try {
                            u = call.call();
                        } catch (e) {
                            this.addError(e);
                            continue;
                        }
                        
                        if (u == null) {
                            continue;
                        }
                        
                        if (this.inner.hasRequested()) {
                            this.actual.onNext(u);
                            this.inner.produceOne();
                            continue;
                        }
                    }
                    */
                    this.active = true;
                    p.subscribe(this.inner);
                }
            }
            
            if (--this.wip == 0) {
                break;
            }
        }
    }
}

class ConcatMapInnerSubscriber<T, R> implements rs.Subscriber<R> {
    
    private s: rs.Subscription;
    
    private requested : number;
    
    private produced: number;
    
    constructor(private parent : ConcatMapSubscriber<T, R>, private actual: rs.Subscriber<R>) {
        this.s = null;
        this.requested = 0;
        this.produced = 0;
    }
    
    onSubscribe(s: rs.Subscription) : void {
        const a = this.s;
        if (a == sp.SH.CANCELLED) {
            s.cancel(); 
        } else {
            this.s = s;
            s.request(this.requested);
        }
    }
    
    onNext(t: R) : void {
        this.produced++;
        this.actual.onNext(t);        
    }
    
    onError(t: Error) : void {
        this.applyProduced();
        this.parent.innerError(t);
    }
    
    onComplete() : void {
        this.applyProduced();
        this.parent.innerComplete();        
    }
    
    applyProduced() : void {
        const r = this.requested;
        if (r != Infinity) {
            this.requested = r - this.produced;
        }
    }
    
    request(n: number) : void {
        if (sp.SH.validRequest(n)) {
            this.requested += n;
            const a = this.s;
            if (a != null) {
                a.request(n);
            }
        }
    }
    
    cancel() : void {
        const a = this.s;
        if (a != sp.SH.CANCELLED) {
            this.s = sp.SH.CANCELLED;
            if (a != null && a != sp.SH.CANCELLED) {
                a.cancel();
            }
        }
    }
    
    hasRequested() : boolean {
        return this.requested != 0;
    }
    
    produceOne() : void {
        const r = this.requested;
        if (r != Infinity) {
            this.requested = r - 1;
        }
    }
}