import * as rs from './reactivestreams-spec';
import * as sp from './subscription';
import * as util from './util';

export class SwitchMapSubscriber<T, R> implements rs.Subscriber<T>, rs.Subscription {
    
    private requested: number = 0;
    private wip: number = 0;
    private error: Error = null;
    private done: boolean = false;
    private s: rs.Subscription = null;
    private index: number = 0;
    private current: SwitchMapInnerSubscriber<T, R> = null;
    private cancelled: boolean = false;
    
    constructor(private actual: rs.Subscriber<R>, private mapper: (t: T) => rs.Publisher<R>, 
            private prefetch: number) {
        
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            this.actual.onSubscribe(this);
            
            s.request(Infinity);
        }
    }
    
    onNext(t: T) : void {
        if (this.done) {
            return;
        }
        const idx = ++this.index;
        const c = this.current;
        if (c != null) {
            c.cancel();
        }
        
        var p;
        
        p = this.mapper(t);
        
        if (p == null) {
            this.onError(new Error("The mapper returned a null Publisher"));
            return;
        }
        
        const inner = new SwitchMapInnerSubscriber(this, this.prefetch, idx);
        
    }
    
    addError(t: Error) : boolean {
        var ex = this.error;
        if (ex != sp.SH.TERMINAL_ERROR) {
            if (ex == null) {
                this.error = t;
            } else {
                this.error = new Error(ex + "\n" + t);
            }
            return true;
        }
        return false;
    }

    onError(t: Error) : void {
        if (this.done) {
            console.log(t);
            return;
        }
        this.done = true;
        if (this.addError(t)) {
            this.drain();
        } else {
            console.log(t);
        }
    }
    
    onComplete() : void {
        if (this.done) {
            return;
        }
        this.done = true;
        this.drain();
    }
    
    request(n: number) : void {
        if (sp.SH.validRequest(n)) {
            this.requested += n;
            this.drain();
        }
    }
    
    cancel() : void {
        if (!this.cancelled) {
            this.cancelled = true;
            this.s.cancel();
            const inner = this.current;
            if (inner != null) {
                inner.cancel();
            }
            if (this.wip++ == 0) {
                this.current = null;
            }
        }
    }
    
    drain() : void {
        if (this.wip++ != 0) {
            return;
        }
        
        const a = this.actual;
        
        var missing = 1;
        
        outer:
        for (;;) {
            var c = this.current;
            if (c != null) {
                const r = this.requested;
                var e = 0;
                
                while (e != r) {
                    if (this.cancelled) {
                        this.current = null;
                        return;
                    }
                    const ex = this.error;
                    if (ex != null) {
                        this.cancel();
                        this.error = sp.SH.TERMINAL_ERROR;
                        a.onError(ex);
                        return;
                    }
                    
                    if (c.index != this.index) {
                        this.requested -= e;
                        continue outer;
                    }
                    
                    var v;
                    
                    v = c.queue.poll();
                    
                    const empty = v == null;
                    
                    if (c.done && empty && this.done) {
                        this.current = null;
                        a.onComplete();
                        return;
                    }
                    
                    if (empty) {
                        break;
                    }
                    
                    a.onNext(v);
                    
                    e++;
                }
                
                if (e == r) {
                    if (this.cancelled) {
                        this.current = null;
                        return;
                    }
                    
                    const ex = this.error;
                    if (ex != null) {
                        this.cancel();
                        this.error = sp.SH.TERMINAL_ERROR;
                        a.onError(ex);
                        return;
                    }

                    if (c.index != this.index) {
                        this.requested -= e;
                        continue outer;
                    }
                    
                    if (this.done && c.done && c.queue.isEmpty()) {
                        this.current = null;
                        a.onComplete();
                        return;
                    }                    
                }
                
                if (e != 0) {
                    this.requested -= e;
                    c.request(e);
                }
            } else {
                const ex = this.error;
                if (ex != null) {
                    this.cancel();
                    this.error = sp.SH.TERMINAL_ERROR;
                    a.onError(ex);
                    return;
                }
                if (this.done) {
                    a.onComplete();
                    return;
                }
            }            
            
            missing = this.wip - missing;
            this.wip = missing;
            if (missing == 0) {
                break;
            }
        }
    }
}

class SwitchMapInnerSubscriber<T, R> implements rs.Subscriber<R> {
    private s: rs.Subscription = null;
    public queue: util.SpscArrayQueue<R>;
    private produced: number = 0;
    private limit: number;
    public done: boolean = false;
    
    constructor(private parent: SwitchMapSubscriber<T, R>, private prefetch: number, public index: number) {
        this.queue = new util.SpscArrayQueue<R>(prefetch);
        this.limit = prefetch - (prefetch >> 2);
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;
            
            s.request(this.prefetch);
        }
    }
    
    onNext(t: R) : void {
        if (!this.queue.offer(t)) {
            this.onError(new Error("SwitchMap inner queue full?!"));
            return;
        }
        this.parent.drain();
    }
    
    onError(t: Error) : void {
        if (this.parent.addError(t)) {
            this.done = true;
            this.parent.drain();
        } else {
            console.log(t);
        }
    }
    
    onComplete() : void {
        this.done = true;
        this.parent.drain();
    }
    
    request(n: number) : void {
        const p = this.produced + n;
        if (p >= this.limit) {
            this.produced = 0;
            this.s.request(p);
        } else {
            this.produced = p;
        }
    }
    cancel() : void {
        var a = this.s;
        if (a != sp.SH.CANCELLED) {
            this.s = sp.SH.CANCELLED;
            if (a != null) {
                a.cancel();
            }
        }
    }
}