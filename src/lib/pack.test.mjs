import assert from "node:assert/strict";
import { test } from "node:test";
import { fileOf, isPacked } from "./pack.mjs";

test("maps down to a country are their own file", () => {
	for (const id of ["world", "world/asia", "world/asia/india"]) {
		assert.equal(fileOf(id), id);
		assert.equal(isPacked(id), false);
	}
});

test("a state and its districts share the state's pack", () => {
	assert.equal(fileOf("world/asia/india/punjab"), "world/asia/india/punjab");
	assert.equal(fileOf("world/asia/india/punjab/bathinda"), "world/asia/india/punjab");
	assert.equal(isPacked("world/asia/india/punjab"), true);
});

test("everything below a district shares the district's pack", () => {
	const district = "world/asia/india/punjab/bathinda";
	assert.equal(fileOf(`${district}/talwandi-sabo`), district);
	assert.equal(fileOf(`${district}/talwandi-sabo/deeper/still`), district);
});
