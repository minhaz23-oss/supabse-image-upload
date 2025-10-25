const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const SUPABASE_URL = "https://zlgeeqociqnuvkmxtdex.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZ2VlcW9jaXFudXZrbXh0ZGV4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NzMxMDQ5MiwiZXhwIjoyMDcyODg2NDkyfQ.3sngN75a3vBHde4UnjtHRbpXq7NT6d0RRdMIJyvbkGk";




const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BUCKET_NAME = "ieltsAudioAndImages";
const FOLDER = "writingImages";

// Use the current folder where the script is run
const INPUT_PARENT_FOLDER = process.cwd();


// Output folder for updated JSONs
const OUTPUT_DIR = path.resolve("C:/Users/Minhaz Fardin/ieltsprep/public/writingTests");

// Utility: get all folders in a directory
function getAllTestFolders(parentDir) {
  return fs.readdirSync(parentDir).filter((f) => {
    const folderPath = path.join(parentDir, f);
    return fs.lstatSync(folderPath).isDirectory() && f.toLowerCase().startsWith("writingtest");
  });
}

// Utility: find all files in a folder by extension
function findFilesByExt(folder, exts) {
  const files = fs.readdirSync(folder);
  return files.filter((f) => exts.includes(path.extname(f).toLowerCase()));
}

async function processFolder(folderName) {
  const folderPath = path.join(INPUT_PARENT_FOLDER, folderName);
  console.log(`\n➡️ Processing folder: ${folderName}`);

  // Find JSON file
  const jsonFiles = findFilesByExt(folderPath, [".json"]);
  if (jsonFiles.length === 0) {
    console.warn(`⚠️ No JSON file found in ${folderName}, skipping...`);
    return;
  }
  const jsonFilePath = path.join(folderPath, jsonFiles[0]);
  const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, "utf-8"));

  // Find images
  const imageFiles = findFilesByExt(folderPath, [".png", ".jpg", ".jpeg"]);
  if (imageFiles.length === 0) {
    console.log(`ℹ️ No images found in ${folderName}`);
  }

  let imageIndex = 0;

  // Process tasks
  for (const task of jsonData.tasks) {
    if (task.hasImage && Array.isArray(task.images)) {
      for (let i = 0; i < task.images.length; i++) {
        if (imageIndex >= imageFiles.length) {
          console.warn(`⚠️ Not enough images for task ${task.taskNumber} in ${folderName}`);
          break;
        }

        const localImage = imageFiles[imageIndex];
        const localImagePath = path.join(folderPath, localImage);

        // Upload image to Supabase
        const imageBuffer = fs.readFileSync(localImagePath);
        const uploadPath = `${FOLDER}/${localImage}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(uploadPath, imageBuffer, {
            cacheControl: "31536000",
            upsert: true,
            contentType: "image/png",
          });
        if (uploadError) throw uploadError;

        // Create signed URL (100 years)
        const hundredYears = 100 * 365 * 24 * 60 * 60;
        const { data: signedUrlData, error: urlError } = await supabase.storage
          .from(BUCKET_NAME)
          .createSignedUrl(uploadPath, hundredYears);
        if (urlError) throw urlError;

        task.images[i].url = signedUrlData.signedUrl;

        console.log(`✅ Uploaded ${localImage} → task ${task.taskNumber}`);
        // Delete local image
        fs.unlinkSync(localImagePath);

        imageIndex++;
      }
    }
  }

  // Save updated JSON using folder name
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, `${folderName}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 2));
  console.log(`✅ Saved updated JSON: ${outputPath}`);

  // Empty original JSON
  fs.writeFileSync(jsonFilePath, "{}");
  console.log("🧹 Emptied original JSON.");
}

async function main() {
  try {
    const folders = getAllTestFolders(INPUT_PARENT_FOLDER).sort((a, b) => {
      // Sort numerically: writingTest6, writingTest7, ...
      const numA = parseInt(a.replace(/\D/g, ""), 10);
      const numB = parseInt(b.replace(/\D/g, ""), 10);
      return numA - numB;
    });

    if (folders.length === 0) {
      console.error("❌ No test folders found!");
      return;
    }

    for (const folder of folders) {
      await processFolder(folder);
    }

    console.log("\n🎉 All folders processed successfully!");
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

main();