import { GoogleGenAI } from "@google/genai";
import { db } from "../db";
import { workOrders } from "@shared/schema";
import { eq } from "drizzle-orm";

export class GeminiService {
  private apiKey: string;
  private ai: GoogleGenAI;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || "";
    if (!this.apiKey) {
      throw new Error("Gemini API key not found");
    }
    this.ai = new GoogleGenAI({ apiKey: this.apiKey });
  }

  // --- NEW, FOCUSED ACTION GENERATION WORKFLOW ---

  async processUserRequestToAction(userMessage: string, tenantId: number): Promise<any> {
    const intentResult = await this.analyzeIntentAndExtractParams(userMessage);
    console.log('🤖 Step 1/3 - Intent Analysis Result:', intentResult);

    if (!intentResult.action || !intentResult.action.type || intentResult.action.type === 'UNKNOWN') {
      return { 
        type: 'chat', 
        message: 'ขออภัยครับ ผมไม่แน่ใจว่าต้องการให้ทำอะไร กรุณาลองระบุให้ชัดเจนขึ้น หรือถามเป็นคำถามทั่วไปครับ' 
      };
    }

    const contextData = await this.fetchContextualData(intentResult.action, tenantId);
    console.log('📄 Step 2/3 - Fetched Context Data:', contextData);

    if (contextData.error) {
      return { type: 'chat', message: `เกิดข้อผิดพลาดในการดึงข้อมูล: ${contextData.error}` };
    }
    
    if (!contextData.workOrder) {
        return { type: 'chat', message: 'ขออภัยครับ ผมไม่พบใบสั่งงานที่เกี่ยวข้องตามที่คุณร้องขอครับ' };
    }

    const finalAction = await this.generateFinalAction(userMessage, intentResult, contextData);
    console.log('✅ Step 3/3 - Generated Final Action:', finalAction);
    
    return finalAction;
  }
  
  private async analyzeIntentAndExtractParams(userMessage: string) {
    const prompt = `You are an expert at understanding user requests for a production management system.
Analyze the following user message and respond ONLY with a JSON object.

User Message: "${userMessage}"

Your task is to identify the user's primary intent and extract all relevant parameters.

Available Actions:
- UPDATE_WORK_ORDER_STATUS: Requires a work order identifier (like "JB123") and a new status.
- CREATE_WORK_LOG: Requires a work order identifier, hours worked, and a description.
- QUERY_WORK_ORDER: Requires a work order identifier.
- UNKNOWN: If the intent is unclear or not supported.

JSON Response Format:
{
  "user_message": "The original user message",
  "action": {
    "type": "UPDATE_WORK_ORDER_STATUS | CREATE_WORK_LOG | QUERY_WORK_ORDER | UNKNOWN",
    "parameters": {
      "workOrderIdentifier": "extracted_id_or_null",
      "newStatus": "extracted_status_or_null",
      "hoursWorked": "extracted_hours_or_null",
      "workDescription": "extracted_description_or_null"
    }
  }
}`;

    try {
      const result = await this.ai.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent(prompt);
      const response = result.response;
      const text = response.text();
      return JSON.parse(text || '{}');
    } catch (error) {
      console.error("Intent analysis error:", error);
      return { action: { type: 'UNKNOWN', parameters: {} } };
    }
  }

  private async fetchContextualData(action: any, tenantId: number) {
    const { parameters } = action;
    
    if (!parameters) return { error: "ไม่มีข้อมูล parameters ใน action" };

    try {
      if (!parameters.workOrderIdentifier) {
        const latestWorkOrder = await db.query.workOrders.findFirst({
          where: eq(workOrders.tenantId, tenantId),
          orderBy: (workOrders, { desc }) => [desc(workOrders.createdAt)],
        });
        return { workOrder: latestWorkOrder };
      } else {
        const specificWorkOrder = await db.query.workOrders.findFirst({
          where: eq(workOrders.orderNumber, parameters.workOrderIdentifier)
        });
        return { workOrder: specificWorkOrder };
      }
    } catch (dbError) {
      console.error("Database fetch error:", dbError);
      return { error: "ไม่สามารถเชื่อมต่อฐานข้อมูลเพื่อค้นหาใบสั่งงานได้" };
    }
  }

  private async generateFinalAction(userMessage: string, intentResult: any, contextData: any) {
    const prompt = `You are a helpful AI assistant. Your task is to generate a final response to the user.
You will be given the user's original message, the analysis of their intent, and real data from the system.
Your response MUST be a single JSON object containing a natural language message and an executable action payload.

1.  **user_message**: The original request.
    \`\`\`json
    ${JSON.stringify(userMessage)}
    \`\`\`

2.  **intent_analysis**: The initial understanding of the request.
    \`\`\`json
    ${JSON.stringify(intentResult.action)}
    \`\`\`

3.  **system_data**: Real data fetched from the database to fulfill the request.
    \`\`\`json
    ${JSON.stringify(contextData)}
    \`\`\`

**Your Task:**
Based on all the information above, create the final JSON response.
- The \`message\` should be a friendly, natural confirmation to the user in Thai.
- The \`action.type\` must be one of the supported types from the intent analysis.
- The \`action.payload\` must be populated with **real data** from \`system_data\`. Do not make up data.
- If the necessary data is not available in \`system_data\` (e.g., work order not found), the \`message\` should inform the user, and the \`action\` should be null.

**Example Response for a successful request:**
\`\`\`json
{
  "message": "รับทราบครับ กำลังจะเปลี่ยนสถานะของใบสั่งงาน ${contextData?.workOrder?.orderNumber} เป็น '${intentResult?.action?.parameters?.newStatus}' นะครับ",
  "action": {
    "type": "UPDATE_WORK_ORDER_STATUS",
    "payload": {
      "workOrderId": ${contextData?.workOrder?.id},
      "orderNumber": "${contextData?.workOrder?.orderNumber}",
      "newStatus": "${intentResult?.action?.parameters?.newStatus}"
    }
  }
}
\`\`\`

**Example Response for a failed request (work order not found):**
\`\`\`json
{
  "message": "ขออภัยครับ ไม่พบใบสั่งงานที่คุณระบุในระบบครับ",
  "action": null
}
\`\`\`

Now, generate the final JSON response for the given request.`;

    try {
      const result = await this.ai.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent(prompt);
      const response = result.response;
      const text = response.text();
      return JSON.parse(text || '{}');
    } catch (error) {
      console.error("Final action generation error:", error);
      return { message: 'ขออภัยครับ เกิดข้อผิดพลาดในการสร้างคำสั่งสุดท้าย', action: null };
    }
  }

  // --- LEGACY CHAT FUNCTION (FALLBACK) ---
  /**
   * Generate simple chat response for non-actionable requests.
   */
  async generateSimpleChatResponse(
    userMessage: string, 
    conversationHistory: Array<{role: string, content: string}> = []
  ): Promise<string> {
    const conversationContext = conversationHistory
      .slice(-10)
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('
'); // THE ACTUAL FIX IS HERE: using a single backslash for the newline character.

    const fullPrompt = `You are a helpful Thai-speaking AI assistant for a production management system.
Previous conversation:
${conversationContext}
Current user message: ${userMessage}
Please provide a concise, helpful response in Thai. Be professional but friendly.`;
    
    try {
      const result = await this.ai.getGenerativeModel({ model: "gemini-1.5-flash" }).generateContent(fullPrompt);
      const response = result.response;
      return response.text() || "ขออภัย ไม่สามารถประมวลผลคำถามได้ในขณะนี้";
    } catch (error: any) {
      console.error("Gemini simple chat error:", error);
      throw new Error(`Failed to generate response: ${error?.message || 'Unknown error'}`);
    }
  }
}
