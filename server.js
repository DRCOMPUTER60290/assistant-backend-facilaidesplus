const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const generateRouter = require("./routes/generate");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/generate", generateRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

