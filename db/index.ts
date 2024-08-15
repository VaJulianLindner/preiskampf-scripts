import path from "node:path";
import * as dotenv from "dotenv";
import {createClient} from "@supabase/supabase-js";

dotenv.config({path: path.resolve(__dirname + "/../../../../../../.env")});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE;
const supabase = createClient(supabaseUrl, supabaseKey);

export const client = supabase;