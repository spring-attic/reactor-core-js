import * as flow from './flow';
import * as rs from './reactivestreams-spec';
import * as sp from './subscription';
import * as util from './util'

export class FlatMapSubscriber<T, R> implements rs.Subscriber<T>, rs.Subscription {
    
    private wip: number;
    private requested: number;
    
    private cancelled: boolean;
    private done: boolean;
    private error: Error;
    
    private s: rs.Subscription;
    
    private scalarQueue : flow.Queue<R>;
    
    private scalarEmission : number;
    private scalarLimit : number;
    
    private subscribers: Array<FlatMapInnerSubscriber<T, R>>;
    private freelist: Array<number>;
    private producerIndex: number;
    private consumerIndex: number;

    private mIndex: number;
    
    private static TERMINAL_ERROR = new Error("Terminated");
    
    constructor(
        private mActual: rs.Subscriber<R>,
        private mMapper: (t: T) => rs.Publisher<R>,
        private mDelayError: boolean,
        private mMaxConcurrency: number,
        private mPrefetch: number
    ) {
        this.wip = 0;
        this.requested = 0;
        this.done = false;
        this.error = null;
        this.scalarQueue = null;
        this.scalarEmission = 0;
        this.mIndex = 0;
        if (mMaxConcurrency == Infinity) {
            this.scalarLimit = Infinity;
        } else {
            this.scalarLimit = mMaxConcurrency - (mMaxConcurrency >> 2);
        }
        this.subscribers = new Array<FlatMapInnerSubscriber<T, R>>();
        this.freelist = new Array<number>();
        this.producerIndex = 0;
        this.consumerIndex = 0;
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            
            this.s = s;
            
            this.mActual.onSubscribe(this);
            
            if (this.mMaxConcurrency == Infinity) {
                s.request(Infinity);
            } else {
                s.request(this.mMaxConcurrency);
            }
            
        }
    }
    
    onNext(t: T) : void {
        var p: rs.Publisher<R>;
        
        try {
            p = this.mMapper(t);
        } catch (ex) {
            this.s.cancel();
            this.onError(ex);
            return;
        }
        
        if (p == null) {
            this.s.cancel();
            this.onError(new Error("The mapper returned a null Publisher"));
            return;
        }
        
        const c = (p as Object) as flow.Callable<R>;
        
        if (c.call) {
            this.scalarNext(c.call());
        } else {
            const inner = new FlatMapInnerSubscriber<T, R>(this, this.mPrefetch);
            this.addInner(inner);
             
            p.subscribe(inner);
        }
    }
    
    addInner(inner: FlatMapInnerSubscriber<T, R>) {
        //this.subscribers.push(inner);
        const i = this.pollIndex();
        this.subscribers[i] = inner;
    }
    
    pollIndex() : number {
        const b = this.freelist;
        const ci = this.consumerIndex;
        var m = b.length - 1;
        
        if (ci == this.producerIndex) {
            const n = m < 0 ? 1 : (m + 1) * 2;
            b.length = n;
            for (var i = m + 1; i < n; i++) {
                b[i] = i;
            }
            this.consumerIndex = ci + 1;
            this.producerIndex = n - 1;
            return m + 1;
        } else {
            const o = ci & m;
            const idx = b[o];
            this.consumerIndex = ci + 1;
            return idx;
        }
    }
    
    removeInner(index: number) {
        //this.subscribers.splice(index, 1);
        this.subscribers[index] = null;
        this.offerIndex(index);
    }
    
    offerIndex(index: number) : void {
        const b = this.freelist;
        const pi = this.producerIndex;
        const m = b.length - 1;
        const o = pi & m;
        b[o] = index;
        this.producerIndex = pi + 1;
    }
    
    scalarProduced() : void {
        const p = this.scalarEmission + 1;
        if (p == this.scalarLimit) {
            this.scalarEmission = 0;
            this.s.request(p);
        } else {
            this.scalarEmission = p;
        }
    }
    
    scalarNext(t: R) : void {
        if (t == null) {
            this.scalarProduced();
            return;
        }

        if (this.wip == 0) {
            this.wip = 1;
            
            if (this.requested != 0) {
                this.mActual.onNext(t);

                if (this.requested != Infinity) {
                    this.requested--;
                }

                this.scalarProduced();
            } else {
                const q = this.getOrCreateScalarQueue();
                
                if (!q.offer(t)) {
                    this.s.cancel();
                    this.onError(new Error("Scalar queue is full?!"));
                    this.drainLoop();
                    return;
                }
            }
            
            if (--this.wip == 0) {
                return;
            }
            this.drainLoop();
        } else {
            const q = this.getOrCreateScalarQueue();
            
            if (!q.offer(t)) {
                this.s.cancel();
                this.onError(new Error("Scalar queue is full?!"));
                this.drainLoop();
                return;
            }

            this.wip++;            
        }
    }
    
    getOrCreateScalarQueue() : flow.Queue<R> {
        var q : flow.Queue<R> = this.scalarQueue;
        if (this.scalarQueue == null) {
            if (this.mMaxConcurrency == Infinity) {
                q = new util.SpscLinkedArrayQueue<R>(this.mPrefetch);
            } else {
                q = new util.SpscArrayQueue<R>(this.mMaxConcurrency);
            }
            this.scalarQueue = q;
        }
        return q;
    }

    onError(t: Error) : void {
        if (this.done) {
            console.log(t);
            return;
        }
        if (this.addError(t)) {
            this.done = true;
            this.drain();
        } else {
            console.log(t);
        }
    }
    
    onComplete() : void {
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
        this.cancelled = true;
        this.s.cancel();
        
        if (this.wip++ == 0) {
            this.cleanup();
        }
    }
    
    addError(t: Error) {
        var ex = this.error;
        if (ex != FlatMapSubscriber.TERMINAL_ERROR) {
            if (ex == null) {
                this.error = t;
            } else {
                this.error = new Error(ex + "\n" + t);
            }
            return true;
        }
        return false;
    }
    
    innerError(inner: FlatMapInnerSubscriber<T, R>, t: Error) {
        if (this.addError(t)) {
            inner.done = true;
            this.drain();
        } else {
            console.log(t);
        }
    }
    
    innerNext(inner: FlatMapInnerSubscriber<T, R>, t: R) {
        if (this.wip == 0) {
            this.wip = 1;
            
            if (this.requested != 0) {
                this.mActual.onNext(t);
                if (this.requested != Infinity) {
                    this.requested--;
                }
                
                inner.request(1);
            } else {
                const q = inner.getOrCreateQueue();
                if (!q.offer(t)) {
                    inner.cancel();
                    this.innerError(inner, new Error("Inner queue full?!"));
                    this.drainLoop();
                    return;   
                }
            }
            
            if (--this.wip == 0) {
                return;
            }
            this.drainLoop();
        } else {
            const q = inner.getOrCreateQueue();
            if (!q.offer(t)) {
                inner.cancel();
                this.innerError(inner, new Error("Inner queue full?!"));
                this.drainLoop();
                return;   
            }
            this.wip++;            
        }
    }
    
    drain() {
        if (this.wip++ == 0) {
            this.drainLoop();
        }
    }
    
    drainLoop() {
        var missed = this.wip;

        const b = this.subscribers;
        const a = this.mActual;
        
        for (;;) {
            
            var sq = this.scalarQueue;
            var requestMain = 0;

            const r = this.requested;
            var e = 0;
            
            if (sq != null) {
                while (e != r) {
                    const v = sq.poll();
                    const empty = v == null;

                    if (this.checkTerminated(this.done, empty && b.length == 0)) {
                        return;
                    }
                    
                    if (empty) {
                        break;
                    }
                    
                    a.onNext(v);
                    
                    e++;
                    this.scalarProduced();
                }
            }
            
            if (b.length != 0 && e != r) {
                var i = this.mIndex;

                if (i >= b.length) {
                    i = 0;
                }
                
                for (var j = 0; j < b.length; j++) {
                    
                    if (this.cancelled) {
                        this.cleanup();
                        return;
                    }

                    if (!this.mDelayError && this.error != null) {
                        const ex = this.error;
                        this.error = FlatMapSubscriber.TERMINAL_ERROR;
                        this.s.cancel();
                        this.cleanup();
                        a.onError(ex);
                        return;
                    }
                    
                    const inner = b[i];
                    if (inner != null) {
                    
                        const q = inner.queue;
                        if (q == null || q.isEmpty()) {
                            if (inner.done) {
                                this.removeInner(i);
                                //i--;
                                requestMain++;                  
                            }               
                        } else {
                            while (e != r) {
                                if (this.cancelled) {
                                    this.cleanup();
                                    return;
                                }

                                if (!this.mDelayError && this.error != null) {
                                    this.s.cancel();
                                    this.cleanup();
                                    a.onError(this.error);
                                    return;
                                }
                                
                                var v;
                                
                                try {
                                    v = q.poll();
                                } catch (ex) {
                                    this.addError(ex);

                                    if (!this.mDelayError) {
                                        this.s.cancel();
                                        this.cleanup();
                                        ex = this.error;
                                        this.error = FlatMapSubscriber.TERMINAL_ERROR;
                                        a.onError(ex);
                                        return;
                                    } else {
                                        inner.cancel();
                                    }
                                    
                                    this.removeInner(i);
                                    //i--;
                                    requestMain++;                  
                                    break;
                                }
                                const empty = v == null;

                                if (inner.done && empty) {
                                    this.removeInner(i);
                                    //i--;
                                    requestMain++;                  
                                    break;
                                }

                                if (empty) {
                                    break;
                                }
                                
                                a.onNext(v);
                                
                                e++;
                                inner.request(1);
                            }
                            
                            if (e == r) {
                                if (this.cancelled) {
                                    this.cleanup();
                                    return;
                                }
                                
                                if (inner.done && q.isEmpty()) {
                                    this.removeInner(i);
                                    //i--;
                                    requestMain++;
                                }
                                break;    
                            }
                        }
                    }
                    
                    if (++i >= b.length) {
                        i = 0;
                    }
                }
                this.mIndex = i;   
            }

            sq = this.scalarQueue;
            if (this.checkTerminated(this.done, (sq == null || sq.isEmpty()) && b.length == 0)) {
                return;
            }

            if (e != 0 && this.requested != Infinity) {
                this.requested -= e;
            }
            
            if (!this.done && requestMain != 0 && this.mMaxConcurrency != Infinity) {
                this.s.request(requestMain);
                continue;
            }
                        
            const m = this.wip - missed;
            if (m == 0) {
                this.wip = 0;
                break;
            }
            missed = m;
        }
    }
    
    cleanup() {
        this.scalarQueue = null;
        for (var inner of this.subscribers) {
            inner.cancel();
        }
        this.subscribers.length = 0;
    }
    
    checkTerminated(d: boolean, empty : boolean) : boolean {
        if (this.cancelled) {
            this.cleanup();
            return true;            
        }
        
        if (this.mDelayError) {
            if (d && empty) {
                const ex = this.error;
                this.error = FlatMapSubscriber.TERMINAL_ERROR;
                if (ex != null) {
                    this.mActual.onError(ex);
                } else {
                    this.mActual.onComplete();
                }
                return true;
            }
        } else {
            if (d) {
                const ex = this.error;
                if (ex != null) {
                    this.error = FlatMapSubscriber.TERMINAL_ERROR;
                    this.s.cancel();
                    this.cleanup();
                    this.mActual.onError(ex);
                    return true;
                } else
                if (empty) {
                    this.mActual.onComplete();
                    return true;
                }
            }
        }
        
        return false;
    }
}

class FlatMapInnerSubscriber<T, R> implements rs.Subscriber<R> {
    
    queue: flow.Queue<R>;
    
    private s: rs.Subscription;
    
    private produced : number;
    
    private limit : number;
    
    done: boolean;
 
    private sourceMode: number;
    
    constructor(private mParent: FlatMapSubscriber<T, R>, private mPrefetch: number) {
        this.queue = null;
        this.produced = 0;
        this.done = false;
        this.limit = mPrefetch - (mPrefetch >> 2);
        this.sourceMode = 0;
    }
    
    onSubscribe(s: rs.Subscription) : void {
        if (sp.SH.validSubscription(this.s, s)) {
            this.s = s;

            /* fusion seems to add significant overhead
            
            const qs = s as flow.QueueSubscription<R>;
            
            if (qs.requestFusion) {
                const mode = qs.requestFusion(flow.FC.ANY);
                
                if (mode == flow.FC.SYNC) {
                    this.sourceMode = mode;
                    this.queue = qs;
                    this.done = true;
                    
                    this.mParent.drain();
                    return;
                } else
                if (mode == flow.FC.ASYNC) {
                    this.sourceMode = mode;
                    this.queue = qs;
                    
                    s.request(this.mPrefetch);
                    
                    return;
                }
            }
            */
            
            s.request(this.mPrefetch);        
        }
    }
    
    onNext(t: R) : void {
        if (this.sourceMode == flow.FC.ASYNC) {
            this.mParent.drain();
        } else {
            this.mParent.innerNext(this, t);
        }
    }
    
    onError(t: Error) : void {
        this.mParent.innerError(this, t);
    }
    
    onComplete() : void {
        this.done = true;
        this.mParent.drain();        
    }
    
    request(n: number) : void {
        if (this.sourceMode != flow.FC.SYNC) {
            const p = this.produced + n;
            if (p >= this.limit) {
                this.produced = 0;
                this.s.request(p);
            } else {
                this.produced = p;
            }
        }
    }

    getOrCreateQueue() : flow.Queue<R> {
        var q : flow.Queue<R> = this.queue;
        if (this.queue == null) {
            q = new util.SpscArrayQueue<R>(this.mPrefetch);
            this.queue = q;
        }
        return q;
    }

    cancel() : void {
        this.s.cancel();
    }
}