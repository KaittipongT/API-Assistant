import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import { Octokit } from '@octokit/rest';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(bodyParser.json());

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const prisma = new PrismaClient();

app.post('/repositories', async (req: Request, res: Response) => {
    const { repository_name, owner } = req.body;
    try {
        const repository = await prisma.repository.create({
            data: { name: repository_name, owner }
        });
        res.status(201).json(repository);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add repository.' });
    }
});

app.delete('/repositories', async (req: Request, res: Response) => {
    const { repository_name, owner } = req.body;
    try {
        await prisma.repository.deleteMany({
            where: { name: repository_name, owner }
        });
        res.status(200).json({ message: 'Repository removed.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove repository.' });
    }
});

app.get('/repositories', async (_req: Request, res: Response) => {
    try {
        const repositories = await prisma.repository.findMany();
        res.status(200).json(repositories);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch repositories.' });
    }
});

app.get('/repositories/:repository_name/pull-requests', async (req: Request, res: Response) => {
    const { repository_name } = req.params;
    const owner = req.query.owner as string;
    try {
        const pullRequests = await octokit.pulls.list({
            owner,
            repo: repository_name
        });
        res.status(200).json(pullRequests.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch pull requests.' });
    }
});

app.post('/repositories/:repository_name/pull-requests/:pull_request_id/merge', async (req: Request, res: Response) => {
    const { repository_name, pull_request_id } = req.params;
    const owner = req.query.owner as string;
    try {
        const pullRequest = await octokit.pulls.get({
            owner,
            repo: repository_name,
            pull_number: parseInt(pull_request_id)
        });

        if (pullRequest.data.labels.some(label => label.name === 'do not merge')) {
            return res.status(400).json({ error: 'Pull request has a "do not merge" label.' });
        }

        const mergeResponse = await octokit.pulls.merge({
            owner,
            repo: repository_name,
            pull_number: parseInt(pull_request_id)
        });

        res.status(200).json(mergeResponse.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to merge pull request.' });
    }
});

app.get('/generate-configs', async (_req: Request, res: Response) => {
    try {
        const dockerfileContent = `
            FROM node:16
            WORKDIR /app
            COPY package*.json ./
            RUN npm install
            COPY . ./
            EXPOSE 3000
            CMD ["npm", "start"]
        `;
        fs.writeFileSync('Dockerfile', dockerfileContent);

        const terraformContent = `
            provider "aws" {
                region = "us-east-1"
            }

            resource "aws_instance" "web" {
                ami           = "ami-0c55b159cbfafe1f0"
                instance_type = "t2.micro"
                tags = {
                    Name = "DevOps-Test"
                }
            }
        `;
        fs.writeFileSync('main.tf', terraformContent);

        res.status(200).json({ message: 'Configurations generated successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate configurations.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
