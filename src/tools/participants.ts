import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export function registerParticipantTools(
  server: McpServer,
  supabase: SupabaseClient
): void {
  server.tool(
    "list_participants",
    "List all hackathon participants",
    {
      limit: z.number().int().min(1).max(100).optional().describe("Max results to return (default 50)"),
      offset: z.number().int().min(0).optional().describe("Pagination offset"),
    },
    async ({ limit = 50, offset = 0 }) => {
      const { data, error } = await supabase
        .from("participants")
        .select("*")
        .range(offset, offset + limit - 1)
        .order("created_at", { ascending: false });

      if (error) {
        return {
          content: [{ type: "text", text: `Error fetching participants: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "get_participant",
    "Get a single participant by ID",
    {
      id: z.string().uuid().describe("Participant UUID"),
    },
    async ({ id }) => {
      const { data, error } = await supabase
        .from("participants")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Error fetching participant: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "create_participant",
    "Register a new hackathon participant",
    {
      name: z.string().min(1).describe("Full name"),
      email: z.string().email().describe("Email address"),
      company: z.string().optional().describe("Company or organization"),
      role: z.string().optional().describe("Job role or title"),
    },
    async ({ name, email, company, role }) => {
      const { data, error } = await supabase
        .from("participants")
        .insert({ name, email, company, role })
        .select()
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Error creating participant: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "update_participant",
    "Update an existing participant's information",
    {
      id: z.string().uuid().describe("Participant UUID"),
      name: z.string().min(1).optional().describe("Full name"),
      email: z.string().email().optional().describe("Email address"),
      company: z.string().optional().describe("Company or organization"),
      role: z.string().optional().describe("Job role or title"),
    },
    async ({ id, name, email, company, role }) => {
      const updates: Record<string, string> = {};
      if (name !== undefined) updates["name"] = name;
      if (email !== undefined) updates["email"] = email;
      if (company !== undefined) updates["company"] = company;
      if (role !== undefined) updates["role"] = role;

      const { data, error } = await supabase
        .from("participants")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return {
          content: [{ type: "text", text: `Error updating participant: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    "delete_participant",
    "Remove a participant from the hackathon",
    {
      id: z.string().uuid().describe("Participant UUID"),
    },
    async ({ id }) => {
      const { error } = await supabase
        .from("participants")
        .delete()
        .eq("id", id);

      if (error) {
        return {
          content: [{ type: "text", text: `Error deleting participant: ${error.message}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `Participant ${id} deleted successfully` }],
      };
    }
  );
}
