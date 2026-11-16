#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerCrud, registerPrompts } from "./tools/crud.js";

const server = new McpServer({ name: "note-taker", version: "0.3.0" });
registerCrud(server);     // meetings, recordings, transcripts, recaps: create / read / update / delete
registerPrompts(server);
await server.connect(new StdioServerTransport());
