'use client';

import { motion } from 'framer-motion';
import { ExternalLink, Github, Star, ArrowUpRight } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

import type { PublicProfile } from '@/types';

interface PortfolioViewProps {
  profile: PublicProfile;
}

export function PortfolioView({ profile }: PortfolioViewProps) {
  const initials = `${profile.firstName?.[0] || ''}${profile.lastName?.[0] || ''}`;
  const featuredProjects = profile.projects?.filter((p) => p.featured) || [];
  const otherProjects = profile.projects?.filter((p) => !p.featured) || [];

  return (
    <div className="space-y-12">
      {/* Header */}
      <header className="text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <Avatar className="mx-auto h-28 w-28 border-4 border-background shadow-lg">
            <AvatarImage
              src={profile.avatarUrl || undefined}
              alt={profile.firstName || undefined}
            />
            <AvatarFallback className="text-3xl">{initials}</AvatarFallback>
          </Avatar>
        </motion.div>
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h1 className="mt-4 text-4xl font-bold">
            {profile.firstName} {profile.lastName}
          </h1>
          {profile.headline && (
            <p className="mt-2 text-xl text-muted-foreground">{profile.headline}</p>
          )}
          {profile.summary && (
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">{profile.summary}</p>
          )}
        </motion.div>

        {/* Links */}
        {profile.links && profile.links.length > 0 && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-6 flex flex-wrap justify-center gap-3"
          >
            {profile.links.slice(0, 5).map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-primary/20"
              >
                {link.label}
                <ArrowUpRight className="h-4 w-4" />
              </a>
            ))}
          </motion.div>
        )}
      </header>

      {/* Featured Projects */}
      {featuredProjects.length > 0 && (
        <section>
          <div className="mb-6 flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            <h2 className="text-2xl font-bold">Featured Work</h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {featuredProjects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ y: 40, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="group overflow-hidden">
                  {project.imageUrl && (
                    <div className="relative aspect-video overflow-hidden">
                      <img
                        src={project.imageUrl}
                        alt={project.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                      <div className="absolute bottom-4 left-4 right-4">
                        <h3 className="text-xl font-bold text-white">{project.title}</h3>
                      </div>
                    </div>
                  )}
                  <CardContent className={project.imageUrl ? 'pt-4' : 'pt-6'}>
                    {!project.imageUrl && <h3 className="text-xl font-bold">{project.title}</h3>}
                    {project.shortDesc && (
                      <p className="mt-2 text-muted-foreground">{project.shortDesc}</p>
                    )}
                    {project.description && !project.shortDesc && (
                      <p className="mt-2 line-clamp-3 text-muted-foreground">
                        {project.description}
                      </p>
                    )}
                    {project.techStack && project.techStack.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-1">
                        {project.techStack.slice(0, 6).map((tech) => (
                          <Badge key={tech} variant="secondary" className="text-xs">
                            {tech}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 flex gap-3">
                      {project.url && (
                        <a
                          href={project.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Live Demo
                        </a>
                      )}
                      {project.repoUrl && (
                        <a
                          href={project.repoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                        >
                          <Github className="h-4 w-4" />
                          Source Code
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Other Projects */}
      {otherProjects.length > 0 && (
        <section>
          <h2 className="mb-6 text-2xl font-bold">More Projects</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {otherProjects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
              >
                <Card className="h-full">
                  <CardContent className="flex h-full flex-col pt-6">
                    <h3 className="font-semibold">{project.title}</h3>
                    {project.shortDesc && (
                      <p className="mt-1 flex-1 text-sm text-muted-foreground">
                        {project.shortDesc}
                      </p>
                    )}
                    {project.techStack && project.techStack.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {project.techStack.slice(0, 4).map((tech) => (
                          <Badge key={tech} variant="outline" className="text-xs">
                            {tech}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex gap-3">
                      {project.url && (
                        <a
                          href={project.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          View
                        </a>
                      )}
                      {project.repoUrl && (
                        <a
                          href={project.repoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline"
                        >
                          Code
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* Skills Section */}
      {profile.skills && profile.skills.length > 0 && (
        <section>
          <h2 className="mb-6 text-2xl font-bold">Tech Stack</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {profile.skills.map((skill, index) => (
              <motion.div
                key={skill.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: index * 0.03 }}
              >
                <Badge
                  variant={skill.level === 'EXPERT' ? 'default' : 'secondary'}
                  className="px-4 py-2 text-sm"
                >
                  {skill.name}
                </Badge>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* No projects fallback */}
      {(!profile.projects || profile.projects.length === 0) && (
        <div className="py-12 text-center text-muted-foreground">
          <p>No projects to display yet.</p>
        </div>
      )}
    </div>
  );
}
