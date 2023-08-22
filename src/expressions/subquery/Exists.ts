/*
 * Copyright (c) "Neo4j"
 * Neo4j Sweden AB [http://neo4j.com]
 *
 * This file is part of Neo4j.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { CypherEnvironment } from "../../Environment";
import type { Clause } from "../../clauses/Clause";
import { CypherASTNode } from "../../CypherASTNode";
import { padBlock } from "../../utils/pad-block";

/**
 * @see [Cypher Documentation](https://neo4j.com/docs/cypher-manual/current/syntax/expressions/#existential-subqueries)
 * @group Other
 */
export class Exists extends CypherASTNode {
    private subQuery: CypherASTNode;

    constructor(subQuery: Clause) {
        super();
        const rootQuery = subQuery.getRoot();
        this.addChildren(rootQuery);
        this.subQuery = rootQuery;
    }

    /**
     * @internal
     */
    public getCypher(env: CypherEnvironment): string {
        const subQueryStr = this.subQuery.getCypher(env);
        const paddedSubQuery = padBlock(subQueryStr);
        try {
            const transformedSubQuery = this.transformCypherQuery(paddedSubQuery);
            return `EXISTS (\n${transformedSubQuery}\n)`;
        } catch (e) {
            return `EXISTS {\n${paddedSubQuery}\n)`;
        }
    }

    /**
     * @internal
     */
    private transformCypherQuery(cypherFragment: string): string {
        type CypherCondition = { [key: string]: string };

        // Remove the word "MATCH" and any preceding whitespace
        const strippedMatch: string = cypherFragment.replace(/^\s*MATCH\s+/i, "");

        // Extract the property conditions from the WHERE clause using regex
        const whereRegEx: RegExp = /WHERE\s+\(?(.*?)\)?$/i;
        const whereMatch: RegExpMatchArray | null = strippedMatch.match(whereRegEx);

        if (!whereMatch || !whereMatch[1]) {
            throw new Error("No WHERE clause found.");
        }

        const conditions: CypherCondition[] = whereMatch[1].split(/\s+AND\s+/i).map((condition: string) => {
            const [key = "", value = ""] = condition.split(/\s*=\s*/); // default values to handle potential undefined
            // Strip off any node prefix (like "this3.") from the key
            const strippedKey: string = key.split(".").pop() as string; // assert that this will always be a string
            return { [strippedKey]: value };
        }) as CypherCondition[];

        // Create the properties string for the node
        const properties: string = conditions
            .map((cond) => {
                const keys = Object.keys(cond);
                if (!keys.length) return "";
                const key: string = keys[0] as string;
                return `${key}: ${cond[key]}`;
            })
            .join(", ");

        // Replace the WHERE clause with the properties string
        let transformed: string = strippedMatch
            .replace(whereRegEx, "")
            .replace(/:(\w+|`[^`]+`)\s*(?=\))/, `$& { ${properties} }`);

        // Remove the variable name inside node parentheses but keep the colon
        transformed = transformed.replace(/\(\w+(:)/g, "($1");

        return transformed;
    }
}
