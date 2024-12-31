declare interface Set<T> {
	intersection(otherSet: Set<T>): Set<T>;
	union(otherSet: Set<T>): Set<T>;
	difference(otherSet: Set<T>): Set<T>;
}
