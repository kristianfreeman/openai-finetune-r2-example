import { Context, Hono } from 'hono'
import { toFile } from 'openai/uploads'
import OpenAI from 'openai'

type Bindings = {
	ASSETS: R2Bucket
	OPENAI_API_KEY: string
}

type Variables = {
	openai: OpenAI
}

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>()

const getJobs = async (c: Context) => {
	const openai: OpenAI = c.get("openai")
	const resp = await openai.fineTuning.jobs.list()
	return resp.data
}

const createFile = async (c: Context, r2Object: R2ObjectBody) => {
	const openai: OpenAI = c.get("openai")

	const blob = await r2Object.blob()
	const file = await toFile(blob, r2Object.key)

	const uploadedFile = await openai.files.create({
		file,
		purpose: "fine-tune",
	})

	return uploadedFile
}

const createModel = async (c: Context, file: string) => {
	const openai: OpenAI = c.get("openai")

	const body = {
		training_file: file,
		model: "gpt-3.5-turbo",
	}

	return openai.fineTuning.jobs.create(body)
}

app.use('*', async (c, next) => {
	const openai = new OpenAI({
		apiKey: c.env.OPENAI_API_KEY,
	})
	c.set("openai", openai)
	await next()
})

app.get('/jobs', async c => {
	const jobs = await getJobs(c)
	return c.json(jobs)
})

app.post('/files', async c => {
	const fileQueryParam = c.req.query("file")
	if (!fileQueryParam) return c.text("Missing file query param", 400)

	const file = await c.env.ASSETS.get(fileQueryParam)
	if (!file) return c.text("Couldn't find file", 400)

	const uploadedFile = await createFile(c, file)
	return c.json(uploadedFile)
})

app.post('/models', async c => {
	const fileQueryParam = c.req.query("file")
	if (!fileQueryParam) return c.text("Missing file query param", 400)

	const model = await createModel(c, fileQueryParam)
	return c.json(model)
})

app.onError((err, c) => {
	return c.text(err.message, 500)
})

export default app