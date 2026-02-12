# UI Kit (PR8a)

Use these primitives for consistent premium styling:

- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`
- `Button` (`primary | secondary | ghost | danger`, sizes `sm|md|lg`)
- `Badge` (`neutral | brand | success | warning | danger`)
- `Input`
- `Modal`
- `Skeleton`
- `EmptyState`
- `Divider`

Example:

```jsx
<Card>
  <CardHeader>
    <CardTitle>Quote Summary</CardTitle>
    <CardDescription>Waiting for customer response</CardDescription>
  </CardHeader>
  <CardContent>
    <Badge variant="brand">sent</Badge>
  </CardContent>
  <CardFooter>
    <Button variant="primary">Copy link</Button>
  </CardFooter>
</Card>
```
