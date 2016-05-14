import { Cancellation } from './flow';

export interface Observable<T> {
    subscribe(s: Observer<T>) : void;
} 

export interface Observer<T> {
    onSubscribe(d: Cancellation) : void;
    
    onNext(t: T) : void;
    
    onError(t: Error) : void;
    
    onComplete() : void;
}

export interface Subject<T, R> extends Observer<T>, Observable<R> {
    
}