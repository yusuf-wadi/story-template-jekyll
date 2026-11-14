---
title: "I Built A Machine Learning Therapist"
date: 2022-12-14
summary: "Have you ever wondered what it would be like, to express your feelings to the whole world, and get the breadth of the whole worlds’ experiences as a response. That is an idea that can now be made into…"
---

<!-- generated from ~/life/writing/blog; edit the note, not this file -->

Have you ever wondered what it would be like, to express your feelings to the whole world, and get the breadth of the whole worlds’ experiences as a response. That is an idea that can now be made into reality, thanks to modern day [Natural Language Processors](https://en.wikipedia.org/wiki/Natural_language_processing) and GPT3.

![](https://cdn-images-1.medium.com/max/512/1*SRH88u9-7waXV3RPnhXgNQ.png)

_what a machine thinks a human talking to a mahcine is like_

A beautiful aspect of Natural Language Processors is the tandem-play of prompts and responses. Each and every token matters, and as such, the construction of the perfect prompt is almost an art in that sense

## Project Rundown

This project was first built in Python as a proof-of-concept, then rebuilt in JavaScript in order to transform into a palatable web-app.

Python main abstract flow:

1. User Input

```
while not done:
    optCONTEXT=""
    your_prompt = input("Enter prompt: ")
    if your_prompt == "exit session":
        done = True
        break
    cur_client = f"USER: {your_prompt}{nl}"
```

2. Context Gathering

```
#read in context
with open(curcon_path,"r") as cc:
    context_ = cc.read()
    lastlines = context_.split('\n')
    lastStrings = ""
    if len(lastlines) > 1:
        lastStrings = lastlines[-2]
    cc.close()
#####

#optimize converation
if len(lastlines) > 2:
    optCONTEXT = optConvo(context_)
####
```

1. Prompt Construction

```
with open(ctx_path, "r") as ctx:
        ctxPrompt = ctx.read()
        ctx.close()
    

    ctxPrompt = ctxPrompt.format(optCONTEXT,lastStrings,your_prompt)
    print(ctxPrompt)
```

1. API Call

```
def callGPT(model=cur_model,prompt="",temp=0,freq=0.5,pres=0.5,tok=120):
  completion = openai.Completion.create(
      model=model,
      prompt=prompt,
      temperature=temp,
      presence_penalty=pres,
      frequency_penalty=freq,
      max_tokens=tok,
      stop=["USER:"]

  )
  response = completion.choices[0].text
  return response.strip('\n')
```

1. Response Display

```
with open(curcon_path,"a+") as cc:
    cc.write(cur_client)
    cc.close()

with open(curcon_path,"a+") as cc:
    cc.write(cur_caly)
    cc.close()
```

[Embedded content (view on Medium)](https://medium.com/media/3bd8bcf11016b837e636bbf31e9f6f05/href)

---

_Originally published on [Medium](https://yusufwadi.medium.com/a-machine-learning-therapist-a31769c3a6a3)._
