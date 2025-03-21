import { Step, Workflow } from "@mastra/core";
import { z } from "zod";
import { faqAgent, faqEditorAgent, faqImageAgent } from "../agents";
import * as fs from "fs";
import * as path from "path";

const generateFAQContentStep = new Step({
  id: "generateFAQContentStep",
  execute: async ({ context }) => {
    if (!context?.triggerData?.prdContent) {
      throw new Error("prdContent not found in trigger data");
    }

    const prompt = `
      Based on the following Product Requirements Document (PRD) content, generate a comprehensive FAQ section.
      Include questions that potential users or stakeholders might ask about this product.
      For each question, provide a clear, concise, and informative answer based on the information in the PRD.
      Organize the FAQs in a logical order, starting with basic questions and moving to more specific ones.
      Try to cover different aspects of the product such as features, use cases, limitations, and technical requirements.

      PRD CONTENT:
      ${context.triggerData.prdContent}
  `;

    const result = await faqAgent.generate(prompt, {
      output: z.object({
        faqContent: z
          .string()
          .describe(
            "A well-formatted FAQ section with questions and answers based on the PRD"
          ),
      }),
    });

    // Save FAQ content to a local file
    const faqsDir = path.join(process.cwd(), "../../output", "faqs");

    // Create the directory if it doesn't exist
    if (!fs.existsSync(faqsDir)) {
      fs.mkdirSync(faqsDir, { recursive: true });
    }

    // Generate filename using Unix timestamp
    const timestamp = Math.floor(Date.now() / 1000);
    const filename = `faq_${timestamp}.md`;
    const filePath = path.join(faqsDir, filename);

    // Write content to file
    fs.writeFileSync(filePath, result.object.faqContent);

    console.log(`FAQ content saved to ${filePath}`);

    return {
      faqContent: result.object.faqContent,
      savedFilePath: filePath,
    };
  },
});

const generateFAQRelatedImage = new Step({
  id: "generateFAQRelatedImageStep",
  execute: async ({ context }) => {
    try {
      const faqContent = context?.getStepResult<{ faqContent: string }>(
        "generateFAQContentStep"
      )?.faqContent;

      if (!faqContent) {
        throw new Error("FAQ content not found from previous step");
      }
      console.log("start generateFAQRelatedImage");

      const prompt = `
      Create exactly 2 informative and visually appealing images that represent the main topics covered in the following FAQ:
      
      ${faqContent}
      
      Image 1 should be a high-level visual summary of the key concepts from the FAQ.
      Image 2 should focus on the most important feature or benefit mentioned in the FAQ.
      
      Please generate exactly 2 images - no more, no less.
    `;

      const result = await faqImageAgent.generate(prompt, {
        output: z.object({
          images: z
            .array(
              z.object({
                imageBase64: z
                  .string()
                  .describe(
                    "Base64 encoded image representing the FAQ content"
                  ),
                imageDescription: z
                  .string()
                  .describe("Brief description of what the image represents"),
              })
            )
            .length(2)
            .describe("Array of exactly 2 images with their descriptions"),
        }),
      });

      console.log("result", result);

      // Save images to local files
      const imagesDir = path.join(process.cwd(), "../../output", "faq-images");

      // Create the directory if it doesn't exist
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const savedImagePaths = [];

      // Save each image in the array
      for (let i = 0; i < result.object.images.length; i++) {
        const image = result.object.images[i];
        const filename = `faq_image_${timestamp}_${i + 1}.png`;
        const filePath = path.join(imagesDir, filename);

        // Convert base64 to image and save
        const imageBuffer = Buffer.from(image.imageBase64, "base64");
        fs.writeFileSync(filePath, imageBuffer);

        console.log(`FAQ image ${i + 1} saved to ${filePath}`);
        savedImagePaths.push(filePath);
      }

      return {
        faqImages: result.object.images.map((img) => img.imageBase64),
        imageDescriptions: result.object.images.map(
          (img) => img.imageDescription
        ),
        savedImagePaths: savedImagePaths,
      };
    } catch (e) {
      console.log("error", e);
      throw e;
    }
  },
});

const improveFaqContent = new Step({
  id: "improveFaqContent",
  execute: async ({ context }) => {
    // Get the FAQ content from the previous step
    const faqContent = context?.getStepResult<{ faqContent: string }>(
      "generateFAQContentStep"
    )?.faqContent;

    if (!faqContent) {
      throw new Error("FAQ content not found from previous step");
    }

    console.log("Starting FAQ content improvement");

    const prompt = `
      Review and improve the following FAQ content:

      ${faqContent}

      Please enhance this FAQ by:
      1. Improving clarity and conciseness of answers
      2. Adding any missing important questions that should be addressed
      3. Ensuring answers are comprehensive and user-friendly
      4. Organizing the questions in a logical flow (from basic to advanced)
      5. Adding appropriate formatting to improve readability
      6. Checking for and correcting any inconsistencies or inaccuracies

      Return the complete improved FAQ content.
    `;

    const result = await faqEditorAgent.generate(prompt, {
      output: z.object({
        improvedFaqContent: z
          .string()
          .describe("The improved FAQ content with better clarity, organization, and completeness"),
        changesExplanation: z
          .string()
          .describe("Brief explanation of the improvements made to the original FAQ")
      }),
    });

    // Save improved FAQ content to a local file
    const faqsDir = path.join(process.cwd(), "../../output", "faqs");

    // Create the directory if it doesn't exist
    if (!fs.existsSync(faqsDir)) {
      fs.mkdirSync(faqsDir, { recursive: true });
    }

    // Generate filename using Unix timestamp
    const timestamp = Math.floor(Date.now() / 1000);
    const filename = `improved_faq_${timestamp}.md`;
    const filePath = path.join(faqsDir, filename);

    // Write content to file
    fs.writeFileSync(filePath, result.object.improvedFaqContent);

    console.log(`Improved FAQ content saved to ${filePath}`);
    console.log("Changes made:", result.object.changesExplanation);

    return {
      originalFaqContent: faqContent,
      improvedFaqContent: result.object.improvedFaqContent,
      changesExplanation: result.object.changesExplanation,
      savedFilePath: filePath
    };
  },
});

const myWorkflow = new Workflow({
  name: "my-workflow",
  triggerSchema: z.object({
    prdContent: z.string(),
  }),
});

myWorkflow
  .step(generateFAQContentStep)
  .then(improveFaqContent)
  .commit();

export { myWorkflow };
