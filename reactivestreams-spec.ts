/** Represents an active connection between a Subscriber and a Publisher. */
export interface Subscription {
    request(n: number) : void;
    cancel() : void;
}

/** Represents the consumer of signals. */
export interface Subscriber<T> {
    onSubscribe(s: Subscription) : void;
    onNext(t: T) : void;
    onError(t: Error) : void;
    onComplete() : void;
}

/** Represents the originator/emitter of signals. */
export interface Publisher<T> {
    subscribe(s: Subscriber<T>) : void; // no idea how to express ? super T
}

/** Represents a Subscriber and Publisher at the same time. */
export interface Processor<T, R> extends Subscriber<T>, Publisher<R> {
    
}