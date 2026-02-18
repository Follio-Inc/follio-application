'use client';

import { Eye, EyeOff, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { notifyProfileUpdated } from '@/lib/events';
import { cn } from '@/lib/utils';

import type { Skill, SkillGroup } from '@/types';

interface SkillsSectionProps {
  skills: Skill[];
  skillGroups: (SkillGroup & { skills: Skill[] })[];
  profileId: string;
  onUpdate: (skills: Skill[], skillGroups: (SkillGroup & { skills: Skill[] })[]) => void;
}

export function SkillsSection({ skills, skillGroups, onUpdate }: SkillsSectionProps) {
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillLevel, setNewSkillLevel] = useState<string>('');
  const [newGroupName, setNewGroupName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addSkill = async () => {
    if (!newSkillName.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/profile/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSkillName.trim(),
          level: newSkillLevel || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add skill');
      }

      const { skill } = await response.json();
      onUpdate([...skills, skill], skillGroups);
      setNewSkillName('');
      setNewSkillLevel('');
      notifyProfileUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const removeSkill = async (skillId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/profile/skills/${skillId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete skill');
      }

      onUpdate(
        skills.filter((s) => s.id !== skillId),
        skillGroups
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const addGroup = async () => {
    if (!newGroupName.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/profile/skill-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add skill group');
      }

      const { skillGroup } = await response.json();
      onUpdate(skills, [...skillGroups, skillGroup]);
      setNewGroupName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const removeGroup = async (groupId: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/profile/skill-groups/${groupId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete skill group');
      }

      // Move skills from deleted group to ungrouped
      const updatedSkills = skills.map((s) =>
        s.groupId === groupId ? { ...s, groupId: null } : s
      );
      onUpdate(
        updatedSkills,
        skillGroups.filter((g) => g.id !== groupId)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSkillVisibility = async (skill: Skill) => {
    const newValue = !(skill.isVisible ?? true);
    // Optimistic update — update both skills array and skillGroups
    const updatedSkills = skills.map((s) =>
      s.id === skill.id ? { ...s, isVisible: newValue } : s
    );
    const updatedGroups = skillGroups.map((g) => ({
      ...g,
      skills: g.skills.map((s) => (s.id === skill.id ? { ...s, isVisible: newValue } : s)),
    }));
    onUpdate(updatedSkills, updatedGroups);
    try {
      const response = await fetch(`/api/profile/skills/${skill.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVisible: newValue }),
      });
      if (!response.ok) throw new Error('Failed to update visibility');
      notifyProfileUpdated();
    } catch {
      // Revert on error
      const revertedSkills = skills.map((s) =>
        s.id === skill.id ? { ...s, isVisible: !newValue } : s
      );
      const revertedGroups = skillGroups.map((g) => ({
        ...g,
        skills: g.skills.map((s) => (s.id === skill.id ? { ...s, isVisible: !newValue } : s)),
      }));
      onUpdate(revertedSkills, revertedGroups);
    }
  };

  // Get ungrouped skills
  const ungroupedSkills = skills.filter((s) => !s.groupId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills</CardTitle>
        <CardDescription>Add your technical and professional skills</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        {/* Add New Skill */}
        <div className="space-y-2">
          <Label>Add a skill</Label>
          <div className="flex gap-2">
            <Input
              value={newSkillName}
              onChange={(e) => setNewSkillName(e.target.value)}
              placeholder="e.g., TypeScript, React, Python"
              onKeyPress={(e) => e.key === 'Enter' && addSkill()}
              className="flex-1"
              disabled={isLoading}
            />
            <Select value={newSkillLevel} onValueChange={setNewSkillLevel} disabled={isLoading}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BEGINNER">Beginner</SelectItem>
                <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
                <SelectItem value="ADVANCED">Advanced</SelectItem>
                <SelectItem value="EXPERT">Expert</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={addSkill} disabled={!newSkillName.trim() || isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Skill Groups */}
        {skillGroups.map((group) => (
          <div key={group.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">{group.name}</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeGroup(group.id)}
                className="h-8 w-8 p-0"
                disabled={isLoading}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3">
              {group.skills.length === 0 ? (
                <span className="text-sm text-muted-foreground">No skills in this group</span>
              ) : (
                group.skills.map((skill) => (
                  <Badge
                    key={skill.id}
                    variant="secondary"
                    className={cn('gap-1 pr-1', skill.isVisible === false && 'opacity-50')}
                  >
                    {skill.isVisible === false && (
                      <EyeOff className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className={cn(skill.isVisible === false && 'line-through')}>
                      {skill.name}
                    </span>
                    {skill.level && (
                      <span className="ml-1 text-xs opacity-70">({skill.level.toLowerCase()})</span>
                    )}
                    <button
                      onClick={() => toggleSkillVisibility(skill)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                      disabled={isLoading}
                      title={skill.isVisible === false ? 'Show on resume' : 'Hide from resume'}
                    >
                      {skill.isVisible === false ? (
                        <Eye className="h-3 w-3" />
                      ) : (
                        <EyeOff className="h-3 w-3" />
                      )}
                    </button>
                    <button
                      onClick={() => removeSkill(skill.id)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-destructive hover:text-destructive-foreground"
                      disabled={isLoading}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>
        ))}

        {/* Ungrouped Skills */}
        {ungroupedSkills.length > 0 && (
          <div className="space-y-2">
            <Label className="text-base font-medium">
              {skillGroups.length > 0 ? 'Other Skills' : 'All Skills'}
            </Label>
            <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3">
              {ungroupedSkills.map((skill) => (
                <Badge
                  key={skill.id}
                  variant="secondary"
                  className={cn('gap-1 pr-1', skill.isVisible === false && 'opacity-50')}
                >
                  {skill.isVisible === false && (
                    <EyeOff className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className={cn(skill.isVisible === false && 'line-through')}>
                    {skill.name}
                  </span>
                  {skill.level && (
                    <span className="ml-1 text-xs opacity-70">({skill.level.toLowerCase()})</span>
                  )}
                  <button
                    onClick={() => toggleSkillVisibility(skill)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                    disabled={isLoading}
                    title={skill.isVisible === false ? 'Show on resume' : 'Hide from resume'}
                  >
                    {skill.isVisible === false ? (
                      <Eye className="h-3 w-3" />
                    ) : (
                      <EyeOff className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    onClick={() => removeSkill(skill.id)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-destructive hover:text-destructive-foreground"
                    disabled={isLoading}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {skills.length === 0 && (
          <div className="py-4 text-center text-muted-foreground">
            No skills added yet. Use the input above to add skills.
          </div>
        )}

        {/* Add Skill Group */}
        <div className="space-y-2 border-t pt-4">
          <Label>Create a skill group (optional)</Label>
          <div className="flex gap-2">
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="e.g., Frontend, Backend, DevOps"
              onKeyPress={(e) => e.key === 'Enter' && addGroup()}
              disabled={isLoading}
            />
            <Button
              onClick={addGroup}
              variant="outline"
              disabled={!newGroupName.trim() || isLoading}
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Group
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
