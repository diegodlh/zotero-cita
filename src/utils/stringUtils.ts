/**
 * Split a string into a list of substrings of a given size, with the last substring possibly being smaller.
 * https://www.30secondsofcode.org/js/s/split-array-into-chunks/
 * @param string string to be split
 * @param chunkSize maximum size of the substring
 * @returns list of substrings of the original string
 */
function splitStringIntoChunks(string: string, chunkSize: number) {
	return Array.from(
		{ length: Math.ceil(string.length / chunkSize) },
		(_, index: number) =>
			string.substring(index * chunkSize, (index + 1) * chunkSize),
	);
}

export { splitStringIntoChunks };
