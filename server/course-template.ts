import type {
  CourseDefinition,
  CourseQuestion,
  CourseResource,
  Theme,
} from "../shared/course.js";

export function blankCourse(): CourseDefinition {
  return {
    title: "Untitled course",
    summary: "",
    language: "en",
    concepts: [],
    resources: [],
    levels: [],
  };
}

const question = (
  id: string,
  prompt: string,
  options: string[],
  answer: number,
  hint: string,
  explanation: string,
  criterion: string,
): CourseQuestion => ({
  id,
  prompt,
  options,
  answer,
  hint,
  explanation,
  rubric: `Award this criterion only for an independent correct selection: ${criterion}. Hints or explanations require a fresh authored retry; game points alone are not mastery.`,
});

export const STORY_MODEL_NOTEBOOK = `# A small decoder-only storytelling model, initialized from scratch
# Dependency: Python 3.10+ and PyTorch 2.x, installed in a learner-owned environment.
# This is authored reference code, not a browser execution service or a recorded training run.
# No dataset download, pretrained checkpoint, paid service, or OpenRouter call is used.
# A CPU can run the 20-step smoke experiment; useful training requires more time/compute.
import json, math, random
from pathlib import Path
import torch
from torch import nn
from torch.nn import functional as F

random.seed(7)
torch.manual_seed(7)
torch.set_num_threads(2)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# corpus.jsonl: one complete story per line, with its provenance retained.
# Example ORIGINAL record (write many longer stories yourself; never repeat this as a dataset):
# {"id":"story-001","text":"A learner began a journey...","license":"original", "source":"original", "author":"Your pen name"}
# Supported licenses below are only this exercise's allowlist. Verify that each claim is true.
# For reused work retain author, exact source URL and license; CC-BY requires attribution.
records = [json.loads(line) for line in Path("corpus.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
assert len(records) >= 5, "Provide at least five distinct stories, not five fragments of one story."
assert len({r["id"] for r in records}) == len(records), "Story IDs must be unique."
assert len({r["text"] for r in records}) == len(records), "Remove exact duplicate stories before splitting."
for r in records:
    assert isinstance(r["text"], str) and len(r["text"]) > 128
    assert r["license"] in {"original", "CC0-1.0", "CC-BY-4.0"}
    assert r.get("author"), "Keep attribution for original and reused stories."
    assert r["source"] == "original" if r["license"] == "original" else r["source"].startswith("https://")

# Group derivative/near-duplicate stories BEFORE this split, keeping each group on one side.
# The small example verifies exact duplicates only; manual review must check near duplicates.
random.shuffle(records)
heldout_count = max(1, len(records) // 5)
valid_records, train_records = records[:heldout_count], records[heldout_count:]
Path("split.json").write_text(json.dumps({"train":[r["id"] for r in train_records], "heldout":[r["id"] for r in valid_records]}, indent=2))
def encode(text):
    return list(text.encode("utf-8"))
def decode(ids):
    return bytes(ids).decode("utf-8", errors="replace")
train_ids = torch.tensor(encode("\\n\\n".join(r["text"] for r in train_records)), dtype=torch.long)
valid_ids = torch.tensor(encode("\\n\\n".join(r["text"] for r in valid_records)), dtype=torch.long)
BLOCK, WIDTH, LAYERS, HEADS, VOCAB = 128, 128, 5, 4, 256
assert min(len(train_ids), len(valid_ids)) > BLOCK

class StoryModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.token = nn.Embedding(VOCAB, WIDTH)
        self.position = nn.Embedding(BLOCK, WIDTH)
        layer = nn.TransformerEncoderLayer(WIDTH, HEADS, WIDTH * 4, dropout=0.1,
                                          activation="gelu", batch_first=True, norm_first=True)
        self.blocks = nn.TransformerEncoder(layer, LAYERS, enable_nested_tensor=False)
        self.norm = nn.LayerNorm(WIDTH)
        # Independently initialize cloned blocks; no pretrained weights are loaded.
        for module in self.modules():
            if isinstance(module, (nn.Linear, nn.Embedding)):
                nn.init.normal_(module.weight, mean=0, std=0.02)
                if isinstance(module, nn.Linear) and module.bias is not None:
                    nn.init.zeros_(module.bias)
            if isinstance(module, nn.MultiheadAttention):
                nn.init.normal_(module.in_proj_weight, mean=0, std=0.02)
                nn.init.zeros_(module.in_proj_bias)
    def forward(self, ids):
        positions = torch.arange(ids.shape[1], device=ids.device)
        x = self.token(ids) + self.position(positions)
        # A causal mask makes these encoder building blocks a decoder-only language model.
        mask = torch.triu(torch.ones(ids.shape[1], ids.shape[1], device=ids.device, dtype=torch.bool), diagonal=1)
        x = self.norm(self.blocks(x, mask=mask))
        return F.linear(x, self.token.weight)  # tied output projection; no extra output bias

model = StoryModel().to(device)
parameter_count = sum(p.numel() for p in model.parameters())
# 256*128 token + 128*128 position + 5*(12*128**2+13*128) blocks + 2*128 final norm
assert parameter_count == 1_040_768, parameter_count
print("Trainable parameters:", parameter_count)
optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4)
def batch(ids, size=2):
    starts = torch.randint(len(ids) - BLOCK, (size,))
    x = torch.stack([ids[i:i+BLOCK] for i in starts]).to(device)
    y = torch.stack([ids[i+1:i+BLOCK+1] for i in starts]).to(device)
    return x, y
@torch.no_grad()
def heldout_loss():
    model.eval()
    # Fixed windows make before/after comparable; do not tune on this held-out score.
    losses = []
    for start in range(0, min(len(valid_ids)-BLOCK, BLOCK*4), BLOCK):
        x = valid_ids[start:start+BLOCK].unsqueeze(0).to(device)
        y = valid_ids[start+1:start+BLOCK+1].unsqueeze(0).to(device)
        losses.append(F.cross_entropy(model(x).reshape(-1, VOCAB), y.reshape(-1)).item())
    return sum(losses)/len(losses)
before = heldout_loss()
for step in range(20):
    model.train()
    x, y = batch(train_ids)
    loss = F.cross_entropy(model(x).reshape(-1, VOCAB), y.reshape(-1))
    optimizer.zero_grad(set_to_none=True)
    loss.backward()
    nn.utils.clip_grad_norm_(model.parameters(), 1.0)
    optimizer.step()
    if step % 5 == 0:
        print("step", step, "training loss", round(loss.item(), 4))
after = heldout_loss()
print({"heldout_loss_before":before, "heldout_loss_after":after, "byte_perplexity":math.exp(after)})
torch.save({"state_dict":model.state_dict(), "parameters":parameter_count,
            "config":{"vocab":VOCAB,"context":BLOCK,"width":WIDTH,"layers":LAYERS,"heads":HEADS}}, "story-model.pt")
# This checkpoint stores learner-created weights. Keep corpus provenance and split.json beside it.
model.eval()
generated = torch.tensor([encode("Once upon a time")], dtype=torch.long, device=device)
with torch.no_grad():
    for _ in range(64):
        logits = model(generated[:, -BLOCK:])[:, -1, :] / 0.9
        next_id = torch.multinomial(torch.softmax(logits, dim=-1), 1)
        generated = torch.cat((generated, next_id), dim=1)
print(decode(generated[0].tolist()))
# Twenty steps check the mechanics; they do not establish coherent storytelling or safety.
# Report repetitions, broken UTF-8, memorization and weak narratives honestly.
`;

/** Authored starter content: tutors review/edit it before publication. */
export function storytellingCourse(): CourseDefinition {
  const resources: CourseResource[] = [
    {
      id: "data-guide",
      title: "Story corpus rights and document splits",
      kind: "reading",
      url: "",
      source: "https://creativecommons.org/licenses/by/4.0/",
      content:
        "Goal: assemble original or explicitly licensed stories and keep a provenance record per document: id, text, author, source URL, license and modifications. CC-BY 4.0 requires attribution, a license link and notice of changes; a public webpage alone is not permission. Avoid personal data and paywalled material. The pilot notebook accepts original work, CC0-1.0 or CC-BY-4.0 only. Tutors must verify every license claim. Split complete documents into training and held-out sets before tokenization; group near duplicates or derived stories together to prevent leakage. Record the split IDs. Five tiny stories can test mechanics, but cannot establish a useful storyteller. This is authored course material linked to the license source; it is not a claim that a corpus has been collected or cleared.",
    },
    {
      id: "token-guide",
      title: "UTF-8 bytes as a compact tokenizer",
      kind: "reading",
      url: "",
      source: "https://docs.python.org/3/library/stdtypes.html#str.encode",
      content:
        "Use list(text.encode('utf-8')) to turn a story into IDs between 0 and 255; bytes(ids).decode('utf-8', errors='replace') converts generated IDs back to text. UTF-8 may encode one character as multiple bytes, so a 128-byte context is not 128 words or always 128 characters. No pretrained tokenizer or downloaded vocabulary is needed. The next-byte task uses x=ids[start:start+128] and y=ids[start+1:start+129]. Split documents first. Byte tokenization supports multilingual text but does not prove equal language quality; a tiny model may generate invalid byte sequences. The source documents Python's encoding behavior.",
    },
    {
      id: "architecture-guide",
      title: "A causal model with five blocks",
      kind: "reading",
      url: "",
      source:
        "https://docs.pytorch.org/docs/stable/generated/torch.nn.TransformerEncoderLayer.html",
      content:
        "The pilot uses 256 token IDs, 128 learned positions, width 128, five Transformer blocks, four attention heads and a 512-wide feed-forward layer. Each head has width 32. Add token and position embeddings, mask future positions, then apply the blocks, final LayerNorm and tied token-embedding output projection. Although the PyTorch building block is named TransformerEncoderLayer, a causal mask and next-byte objective make this a decoder-only autoregressive model; there is no separate encoder or cross-attention. Dropout is 0.1 during training and disabled by model.eval(). Initialize every cloned block independently and load no pretrained weights. Keep hosted classification separate: this storytelling model is a learner artifact, not Amamihe's operational tutor.",
    },
    {
      id: "parameter-guide",
      title: "Count every trainable parameter",
      kind: "reading",
      url: "",
      source:
        "https://docs.pytorch.org/docs/stable/generated/torch.nn.Module.html#torch.nn.Module.parameters",
      content:
        "For the specified PyTorch blocks with biases and two LayerNorms per block: token embedding Vd=256×128=32,768; learned positions Cd=128×128=16,384; each block 12d²+13d=198,272; five blocks 991,360; final LayerNorm 2d=256. Total 1,040,768 trainable parameters. The 12d² combines 4d² attention and 8d² feed-forward weights; the 13d includes their biases and two LayerNorm scale/bias pairs. F.linear(x, token.weight) ties output weights and adds no separate output matrix or bias. Verify sum(p.numel() for p in model.parameters()); changing vocabulary, depth, width, normalization or tying changes the result. The approximately 1M target is a design constraint, not a claim about model quality.",
    },
    {
      id: "training-notebook",
      title: "Reference Python training notebook",
      kind: "notebook",
      url: "",
      source:
        "https://docs.pytorch.org/tutorials/beginner/introyt/trainingyt.html",
      content:
        "Run this reference in a learner-owned Python/PyTorch environment after reviewing corpus rights. Amamihe displays the code; it does not provision compute or run Python in the game client. It needs local corpus.jsonl, records attribution, starts fresh weights, counts parameters, trains for 20 smoke-test steps and saves a checkpoint. Availability, runtime and memory depend on that environment; no free hosted notebook quota is promised.\n\n" +
        STORY_MODEL_NOTEBOOK,
    },
    {
      id: "evaluation-guide",
      title: "Measure held-out loss and inspect stories",
      kind: "reading",
      url: "",
      source:
        "https://docs.pytorch.org/docs/stable/generated/torch.nn.CrossEntropyLoss.html",
      content:
        "Record train/held-out document IDs, parameter count, random seed, step count, device and corpus license manifest. Evaluate fixed unseen windows with model.eval() and no gradients before and after training. Byte-level perplexity is exp(mean next-byte cross-entropy), measured in natural-log units; it is not word-level perplexity and cannot be compared blindly across tokenizers. Keep a final independent test set for later experiments rather than repeatedly tuning against held-out results. Inspect fresh prompts for repetition, coherence, leakage, harmful output and invalid UTF-8; a lower loss alone does not prove good storytelling. Save generated samples with their settings. No actual learner training or useful narrative quality is implied by completing this course's authored quizzes.",
    },
  ];
  const stages = [
    {
      id: "data",
      title: "Prepare a lawful story corpus",
      resource: "data-guide",
      theme: "workshop" as Theme,
      questions: [
        question(
          "data-rights",
          "Which story is ready to include in a traceable training corpus?",
          [
            "A public page with no reuse permission",
            "An original story with its author and rights recorded",
            "A paywalled story copied without permission",
          ],
          1,
          "Being visible online is different from permission to reuse.",
          "An original story with recorded ownership and permission gives a traceable basis for reuse; public access and a paywall do not supply a license.",
          "Identify lawful, traceable training material",
        ),
        question(
          "data-split",
          "When should training and held-out story documents be separated?",
          [
            "Before tokenization, keeping related or duplicate stories together",
            "After mixing random bytes from every story",
            "Only after observing the model's best loss",
          ],
          0,
          "The evaluation should contain stories the model never trained on.",
          "A document-level split made before tokenization prevents the same story or its fragments appearing on both sides. Group near duplicates before splitting.",
          "Prevent document-level evaluation leakage",
        ),
      ],
      retries: [
        question(
          "data-credit-retry",
          "A story uses CC-BY 4.0. What must its provenance record preserve?",
          [
            "Only its word count",
            "Only the dataset folder name",
            "Author credit, source, license link and notices of changes",
          ],
          2,
          "Review what the BY condition requires.",
          "CC-BY requires attribution and license information, with changes indicated. Keep the source and author so reuse can be traced and credited.",
          "Identify lawful, traceable training material",
        ),
        question(
          "data-duplicate-retry",
          "Two near-identical retellings appear in a corpus. How should you split them?",
          [
            "Keep their group on one side of the train/evaluation split",
            "Place one in training and the other in held-out data",
            "Repeat both in every split to increase sample size",
          ],
          0,
          "A retelling can leak almost the same story even if its ID differs.",
          "Related retellings belong in the same split group. Unique IDs alone do not prevent near-duplicate leakage into evaluation.",
          "Prevent document-level evaluation leakage",
        ),
      ],
    },
    {
      id: "tokenization",
      title: "Turn stories into byte tokens",
      resource: "token-guide",
      theme: "temple-chase" as Theme,
      questions: [
        question(
          "token-vocab",
          "How many possible token IDs does this UTF-8 byte tokenizer use?",
          ["128", "256", "One ID per word in the language"],
          1,
          "A byte holds eight bits.",
          "Each byte ranges from 0 to 255, giving 256 possible IDs. A Unicode character may require multiple byte IDs.",
          "Identify the fixed byte vocabulary size",
        ),
        question(
          "token-shift",
          "For next-byte training, how is the target sequence related to the input?",
          [
            "It is the input reversed",
            "It is a copy at the same positions",
            "It is the same stream shifted one byte forward",
          ],
          2,
          "At each position the model predicts what follows.",
          "Input bytes at positions start through start+127 predict bytes start+1 through start+128. The one-position shift supplies the next-byte targets.",
          "Construct aligned next-byte inputs and targets",
        ),
      ],
      retries: [
        question(
          "token-vocabulary-retry",
          "Byte IDs range from 0 through 255. How many token-embedding rows are required?",
          [
            "256 rows, including the row for ID 0",
            "255 rows because ID 0 is not counted",
            "One row for each complete story",
          ],
          0,
          "Count both endpoints of the ID range.",
          "There are 256 distinct IDs from 0 through 255 inclusive. The embedding must have one row for every valid byte ID.",
          "Identify the fixed byte vocabulary size",
        ),
        question(
          "token-target-retry",
          "For the byte stream [65, 66, 67, 68], input [65, 66, 67] should predict which targets?",
          ["[65, 66, 67]", "[66, 67, 68]", "[68, 67, 66]"],
          1,
          "Match each input byte to the next byte in the stream.",
          "The bytes after 65, 66 and 67 are 66, 67 and 68. Shifting the stream forward one position produces the next-byte targets.",
          "Construct aligned next-byte inputs and targets",
        ),
      ],
    },
    {
      id: "architecture",
      title: "Build the causal model",
      resource: "architecture-guide",
      theme: "racing" as Theme,
      questions: [
        question(
          "arch-mask",
          "Why must the attention mask hide later tokens during next-byte training?",
          [
            "So the model cannot copy the answer from the future",
            "To increase the vocabulary to 512",
            "To remove all position information",
          ],
          0,
          "At generation time the later bytes do not exist yet.",
          "A causal mask prevents seeing future target bytes. Without it, training can leak answers unavailable during autoregressive generation.",
          "Explain causal masking and target leakage",
        ),
        question(
          "arch-heads",
          "With model width 128 and four attention heads, what is each head's width?",
          ["512", "4", "32"],
          2,
          "Divide the model width among the heads.",
          "The head width is 128 divided by 4, or 32. The model width must be divisible by the number of heads.",
          "Calculate attention head dimensions",
        ),
      ],
      retries: [
        question(
          "arch-leakage-retry",
          "During training, a position can attend to the byte it is asked to predict next. What has gone wrong?",
          [
            "The dataset has too much attribution",
            "The causal mask is missing or incorrect, leaking a future answer",
            "The model necessarily has too few heads",
          ],
          1,
          "Ask whether that byte would already exist during generation.",
          "The next byte is a future target and must not be visible at its prediction position. An incorrect mask permits answer leakage that cannot be used during generation.",
          "Explain causal masking and target leakage",
        ),
        question(
          "arch-dimensions-retry",
          "Four equal-sized attention heads each have width 32. What model width do they combine into?",
          ["128", "36", "8"],
          0,
          "Combine the dimensions of all four heads.",
          "Four heads with 32 values each combine into width 4×32=128. This reverses the head-width calculation while preserving the pilot architecture.",
          "Calculate attention head dimensions",
        ),
      ],
    },
    {
      id: "parameters",
      title: "Verify the approximately 1M budget",
      resource: "parameter-guide",
      theme: "wrestling" as Theme,
      questions: [
        question(
          "params-total",
          "What is the specified five-block model's trainable parameter count?",
          ["1,040,768", "Exactly 1,000,000 regardless of architecture", "128"],
          0,
          "Add token, position, block and final-normalization parameters once.",
          "32,768 + 16,384 + 5×198,272 + 256 = 1,040,768. This count assumes the documented biases, normalizations and tied output weights.",
          "Calculate the complete specified model parameter count",
        ),
        question(
          "params-tied",
          "What does tying the output projection to token.weight change?",
          [
            "It removes the need for training",
            "It avoids adding a second vocabulary-by-width matrix",
            "It makes all five attention blocks share every weight",
          ],
          1,
          "One parameter can be used in two computations without being counted twice.",
          "F.linear(x, token.weight) reuses the token embedding matrix for output logits. It does not create a separate output matrix or tie the transformer blocks.",
          "Explain output weight tying and count shared parameters once",
        ),
      ],
      retries: [
        question(
          "params-formula-retry",
          "Which expression counts the complete tied-output pilot model once?",
          [
            "256×128 only",
            "5×198,272 only",
            "256×128 + 128×128 + 5×198,272 + 256",
          ],
          2,
          "Include token embeddings, positions, five blocks and final LayerNorm.",
          "The complete sum is 32,768 + 16,384 + 991,360 + 256 = 1,040,768. Tied output weights add no second embedding matrix.",
          "Calculate the complete specified model parameter count",
        ),
        question(
          "params-sharing-retry",
          "Replacing the tied output with a separate bias-free 256-by-128 matrix adds how many parameters?",
          [
            "32,768",
            "Zero, because all output matrices are automatically shared",
            "Five parameters, one for each block",
          ],
          0,
          "The new output matrix stores its own values instead of reusing the embedding.",
          "An independent bias-free matrix adds 256×128=32,768 values. The tied implementation avoids storing this second matrix.",
          "Explain output weight tying and count shared parameters once",
        ),
      ],
    },
    {
      id: "training",
      title: "Run a from-scratch experiment",
      resource: "training-notebook",
      theme: "workshop" as Theme,
      questions: [
        question(
          "train-scratch",
          "Which initialization meets the from-scratch requirement?",
          [
            "Rename a downloaded pretrained checkpoint",
            "Start with independently initialized weights and train on the chosen corpus",
            "Load pretrained weights and change only their output filename",
          ],
          1,
          "From scratch refers to where the learned weights start.",
          "The pilot initializes new weights and loads no pretrained checkpoint. Renaming or fine-tuning existing weights is not training from scratch.",
          "Distinguish original initialization from pretrained fine-tuning",
        ),
        question(
          "train-order",
          "What is the correct basic optimization sequence after computing training loss?",
          [
            "Clear gradients, backpropagate, then update model parameters",
            "Update parameters without gradients and never compute loss",
            "Generate a story and treat its length as the gradient",
          ],
          0,
          "Gradients describe how the loss changes with model parameters.",
          "optimizer.zero_grad clears old gradients; loss.backward computes new ones; optimizer.step updates weights. The notebook clips gradients before updating.",
          "Identify a valid gradient-based training update",
        ),
      ],
      retries: [
        question(
          "train-initialization-retry",
          "A learner constructs the architecture but then loads a pretrained state_dict before training. Is this from-scratch training?",
          [
            "Yes, because the architecture was written locally",
            "Yes, if the new checkpoint has a different name",
            "No; learning starts from previously trained weights",
          ],
          2,
          "Trace the weights actually used at the first optimization step.",
          "Loading a pretrained state_dict replaces fresh initialization with learned weights. Subsequent training is fine-tuning, even if the architecture was written locally.",
          "Distinguish original initialization from pretrained fine-tuning",
        ),
        question(
          "train-gradient-retry",
          "Why clear old gradients before backpropagating the next training batch?",
          [
            "To delete the corpus license records",
            "To avoid unintentionally accumulating previous batches' gradients",
            "To replace all learned weights with the generated story",
          ],
          1,
          "PyTorch adds newly computed gradients to existing gradient buffers.",
          "zero_grad clears existing buffers so backward computes this batch's intended update. Deliberate gradient accumulation is a separate configured technique.",
          "Identify a valid gradient-based training update",
        ),
      ],
    },
    {
      id: "evaluation",
      title: "Evaluate and inspect new stories",
      resource: "evaluation-guide",
      theme: "racing" as Theme,
      questions: [
        question(
          "eval-mode",
          "How should held-out loss be measured?",
          [
            "On the training stories with gradients enabled",
            "Only on the best-looking generated sentence",
            "On fixed unseen windows in evaluation mode without gradients",
          ],
          2,
          "Keep evaluation data and behavior separate from training updates.",
          "model.eval() disables training dropout and no-grad avoids optimization tracking. Fixed held-out windows make before/after loss comparable without training on those stories.",
          "Measure held-out loss without training contamination",
        ),
        question(
          "eval-perplexity",
          "When mean next-byte cross-entropy is measured in natural-log units, what is byte perplexity?",
          [
            "exp(mean cross-entropy)",
            "The number of attention heads",
            "The model's point balance divided by ten",
          ],
          0,
          "Perplexity reverses the logarithm used by cross-entropy.",
          "Byte perplexity is the exponential of mean next-byte cross-entropy. It is tied to this tokenizer and should not be compared blindly with word-level perplexity.",
          "Compute and interpret tokenizer-specific perplexity",
        ),
      ],
      retries: [
        question(
          "eval-dropout-retry",
          "The model contains dropout. Which setup makes the fixed held-out check appropriate?",
          [
            "Training mode with optimizer updates on held-out data",
            "model.eval(), no gradients and no optimizer updates on held-out windows",
            "Use only training windows and choose the smallest reported loss",
          ],
          1,
          "Evaluation should disable training dropout without fitting the held-out examples.",
          "Evaluation mode disables dropout, no-grad removes gradient tracking, and leaving the optimizer untouched keeps held-out data out of training updates.",
          "Measure held-out loss without training contamination",
        ),
        question(
          "eval-number-retry",
          "If mean next-byte cross-entropy is ln(2), what is the byte perplexity?",
          ["ln(2)", "256", "2"],
          2,
          "Apply the exponential to the mean natural-log cross-entropy.",
          "exp(ln(2))=2. This is byte-level perplexity for this tokenizer, not a parameter count or a universal storytelling-quality score.",
          "Compute and interpret tokenizer-specific perplexity",
        ),
      ],
    },
  ];
  return {
    title: "Build a 1M-parameter storytelling model",
    summary:
      "Design a 1,040,768-parameter causal byte language model from scratch. Learn corpus rights, tokenization, architecture, parameter accounting, training and held-out evaluation. Prerequisites: basic Python, arrays and an introductory understanding of neural networks. The game supplies authored resources and assessments; actual training happens in a learner-owned Python/PyTorch environment. Completing quizzes does not certify a trained or useful storytelling model.",
    language: "en",
    resources,
    concepts: stages.map((stage, index) => ({
      id: stage.id,
      title: stage.title,
      prerequisites: index ? [stages[index - 1].id] : [],
    })),
    levels: stages.map((stage, index) => ({
      id: `${stage.id}-level`,
      title: stage.title,
      conceptId: stage.id,
      prerequisites: index ? [`${stages[index - 1].id}-level`] : [],
      theme: stage.theme,
      timeLimitSeconds: 240,
      points: 40,
      resourceIds: [stage.resource],
      // The Python reference is displayed/launchable content; no Python sandbox is claimed.
      widget: "quiz",
      questions: stage.questions,
      retryQuestions: stage.retries.map((retry, retryIndex) => ({
        ...retry,
        retryFor: stage.questions[retryIndex].id,
      })),
    })),
  };
}
